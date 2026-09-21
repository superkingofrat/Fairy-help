import { z } from "zod";
import { prisma, type Prisma } from "@fairy/database";
import type { TripResult, TripPoi, RouteLeg } from "@fairy/shared";
import { sanitizeUserInput, tryChat } from "../agent/llmClient";
import * as profileService from "../services/profileService";
import * as behaviorLogService from "../services/behaviorLogService";
import * as amapClient from "../services/amapClient";

// FU-13：planTripTool——读取画像与消息 → LLM 生成行程草稿 → 高德校验 POI/路线（可选）
// → 落库 Trip + TRIP_PLANNED 日志 → { success, data | { unresolved }, error }。
// 高德缺失/失败时降级：POI 标 validated=false、route=null，仍返回草稿（防幻觉由校验兜底，非阻塞）。

const TRIP_SYSTEM_PROMPT = `你是 Fairy 的旅行规划模块。只输出一个 JSON 对象，不要输出任何解释或代码块标记。
JSON 格式：{"destination":string|null,"itinerary":[{"day":1,"title":string,"steps":[{"time":"HH:mm","poi":string,"category":"景点|美食|住宿|交通|购物|其他","note":string|null}]}]}
规则：
- destination 是用户想去的目的地（城市或地区名）；消息中无法确定时填 null
- 根据消息里的时长/天数推断行程天数（默认 2 天），itinerary 长度等于天数
- 每个 day 至少 1 个步骤，建议 3-8 个；poi 写具体可检索的地点名（如「西湖」「灵隐寺」）
- 参考用户画像的旅行风格（如有），让行程贴合风格
- note 为可选的一句说明；时间用 "HH:mm" 格式`;

const tripDraftSchema = z.object({
  destination: z.string().min(1).nullish(),
  itinerary: z
    .array(
      z.object({
        day: z.number().int().min(1),
        title: z.string().nullish(),
        steps: z
          .array(
            z.object({
              time: z.string(),
              poi: z.string().min(1),
              category: z.string(),
              note: z.string().nullish(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

type TripDraft = z.infer<typeof tripDraftSchema>;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

export type PlanTripToolResult =
  | { success: true; data: { unresolved: true } }
  | { success: true; data: TripResult }
  | { success: false; error: string };

// FU-13：目的地线索规则——「去X玩」「想去X」「规划X的行程」等明确地名结构视为提供了目的地。
// 用于 LLM 草稿失败（空输出/格式非法）时的兜底分流：无线索按未提供目的地追问（AC-5 确定性），
// 有线索才报草稿失败（LLM 故障降级）。保守起见宁缺毋滥：提取不到就追问，不硬造。
const DESTINATION_PATTERNS: RegExp[] = [
  /去([\u4e00-\u9fa5]{2,6}?)(?:玩|旅游|旅行|逛逛|走走|看看|的行程|的旅行)/,
  /到([\u4e00-\u9fa5]{2,6}?)(?:玩|旅游|旅行)/,
  /想去([\u4e00-\u9fa5]{2,6}?)(?:玩|旅游|旅行|吧|，|$)/,
  /(?:规划|安排)(?:一下|个|一趟)?([\u4e00-\u9fa5]{2,6}?)(?:的)?(?:行程|旅行|旅游|出游)/,
];

export function hasDestinationByRules(message: string): boolean {
  return DESTINATION_PATTERNS.some((pattern) => pattern.test(message));
}

async function draftTrip(message: string, travelStyle: string | null): Promise<TripDraft | null> {
  const text = sanitizeUserInput(message);
  if (!text) {
    return null;
  }
  const styleLine = travelStyle ? `用户画像旅行风格：${travelStyle}。` : "";
  const messages = [
    { role: "system" as const, content: TRIP_SYSTEM_PROMPT },
    { role: "user" as const, content: `${styleLine}用户说：「${text}」` },
  ];
  // 严格 JSON 输出：低温度提高稳定性；失败重试两次再降级（模型偶发非法 JSON/截断）
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await tryChat("agent.trip", messages, {
      maxTokens: 1200,
      temperature: 0.2,
    });
    if (!result) {
      continue;
    }
    const parsed = tripDraftSchema.safeParse(extractJson(result.text));
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

export async function planTripTool(input: {
  userId: string;
  message: string;
}): Promise<PlanTripToolResult> {
  const profile = await profileService.getByUserId(input.userId).catch(() => null);

  const draft = await draftTrip(input.message, profile?.travelStyle ?? null);
  if (!draft) {
    const named = hasDestinationByRules(input.message);
    await behaviorLogService.appendQuietly({
      userId: input.userId,
      action: named ? "TRIP_DRAFT_FAILED" : "TRIP_UNRESOLVED",
      payload: {
        reason: named ? "llm_draft_failed" : "draft_failed_no_destination",
        message: input.message.slice(0, 200),
      },
    });
    return named
      ? { success: false, error: "TRIP_DRAFT_FAILED" }
      : { success: true, data: { unresolved: true } };
  }
  const destination = draft.destination?.trim();
  if (!destination) {
    await behaviorLogService.appendQuietly({
      userId: input.userId,
      action: "TRIP_UNRESOLVED",
      payload: {
        reason: "draft_destination_null",
        message: input.message.slice(0, 200),
      },
    });
    return { success: true, data: { unresolved: true } };
  }

  // 高德校验：逐 POI 文本搜索（命中 → 坐标 + validated），相邻已校验 POI 间规划驾车路线
  const searchByPoi = new Map<string, Promise<amapClient.AmapPoi | null>>();
  const lookup = (name: string): Promise<amapClient.AmapPoi | null> => {
    const existing = searchByPoi.get(name);
    if (existing) {
      return existing;
    }
    const promise = amapClient.searchPoi(name, destination);
    searchByPoi.set(name, promise);
    return promise;
  };

  const steps: TripPoi[][] = [];
  let anyValidated = false;
  for (const day of draft.itinerary) {
    const daySteps: TripPoi[] = [];
    for (const step of day.steps) {
      const found = await lookup(step.poi).catch(() => null);
      if (found) {
        anyValidated = true;
        daySteps.push({
          name: step.poi,
          category: step.category,
          time: step.time,
          note: step.note ?? null,
          location: { lng: found.location.lng, lat: found.location.lat },
          validated: true,
        });
      } else {
        daySteps.push({
          name: step.poi,
          category: step.category,
          time: step.time,
          note: step.note ?? null,
          location: null,
          validated: false,
        });
      }
    }
    steps.push(daySteps);
  }

  const itinerary = draft.itinerary.map((day, index) => ({
    day: day.day,
    title: day.title ?? "",
    steps: steps[index],
  }));

  // 路线：按行程顺序取已校验 POI 的相邻对
  const ordered = itinerary.flatMap((day) => day.steps);
  const route: RouteLeg[] = [];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const from = ordered[i];
    const to = ordered[i + 1];
    if (!from.validated || !to.validated || !from.location || !to.location) {
      continue;
    }
    const metrics = await amapClient.planRoute(from.location, to.location).catch(() => null);
    if (metrics) {
      route.push({
        from: from.name,
        to: to.name,
        distanceMeters: metrics.distanceMeters,
        durationSeconds: metrics.durationSeconds,
      });
    }
  }

  try {
    const trip = await prisma.trip.create({
      data: {
        userId: input.userId,
        destination,
        days: itinerary.length,
        itinerary: itinerary as unknown as Prisma.InputJsonValue,
        route: route.length > 0 ? (route as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    await behaviorLogService.appendQuietly({
      userId: input.userId,
      action: "TRIP_PLANNED",
      payload: {
        destination,
        days: itinerary.length,
        tripId: trip.id,
        validated: anyValidated,
      },
    });

    return {
      success: true,
      data: {
        tripId: trip.id,
        destination,
        days: itinerary.length,
        itinerary,
        route: route.length > 0 ? route : null,
        validated: anyValidated,
      },
    };
  } catch (error) {
    console.error("[planTripTool] persist trip failed:", error);
    await behaviorLogService.appendQuietly({
      userId: input.userId,
      action: "TRIP_PERSIST_FAILED",
      payload: {
        reason: "db_write_failed",
        message: input.message.slice(0, 200),
      },
    });
    return { success: false, error: "TRIP_PERSIST_FAILED" };
  }
}

import { z } from "zod";
import { prisma, type Prisma } from "@fairy/database";
import type { TripResult, TripPoi, RouteLeg } from "@fairy/shared";
import { sanitizeUserInput, tryChat } from "../agent/llmClient.js";
import * as profileService from "../services/profileService.js";
import type { CompanionCandidate } from "../services/profileService.js";
import * as behaviorLogService from "../services/behaviorLogService.js";
import * as amapClient from "../services/amapClient.js";

// FU-13：planTripTool——读取画像与消息 → LLM 生成行程草稿 → 高德校验 POI/路线（可选）
// → 落库 Trip + TRIP_PLANNED 日志 → { success, data | { unresolved }, error }。
// 高德缺失/失败时降级：POI 标 validated=false、route=null，仍返回草稿（防幻觉由校验兜底，非阻塞）。

const TRIP_SYSTEM_PROMPT = `你是 Fairy 的旅行规划模块。只输出一个 JSON 对象，不要输出任何解释或代码块标记。
JSON 格式：{"destination":string|null,"itinerary":[{"day":1,"title":string,"steps":[{"time":"HH:mm","poi":string,"category":"景点|美食|住宿|交通|购物|其他","note":string|null,"preferenceBasis":string|null}]}]}
规则：
- destination 是用户想去的目的地（城市或地区名）；消息中无法确定时填 null
- 根据消息里的时长/天数推断行程天数（默认 2 天），itinerary 长度等于天数
- 每个 day 3-4 个步骤（至少 1 个）；poi 写具体可检索的地点名（如「西湖」「灵隐寺」）
- 画像与同行人偏好是约束而非仅供参考：忌口/高标准餐饮就避开路边摊改选可订座的餐厅，注重洁净就避开露天摊位，节奏按旅行风格定；偏好要落实在选点上，note 只写时间/预约/排队等执行信息
- preferenceBasis 只在真能对应到某条画像/同行人偏好时填写，写「哪条偏好 → 因此选/避开了什么」，不超过 20 字；对应不上必须填 null，不得为了填字段而编造依据
- note 为可选的短说明，不超过 15 字；时间用 "HH:mm" 格式`;

// 落实要求：把「偏好要落实在选点上」从一句软约束变成有出口、可验收的要求——每条非空偏好都要在
// 某个 step 的 preferenceBasis 里点名，且选点本身要能体现。只给通用翻译示例，不在代码里枚举
// persona 偏好→POI 的硬编码表（画像数据会变，硬编码会立刻过期，且会把个性化退化成查表）。
//
// 只在真的注入了同行人偏好时才追加：spec（travel-planning「Chat trip planning intent…」）对
// 无同行人的情形有一条 MUST——发给草稿模型的 user 消息要与偏好注入前逐字一致。本人 travelStyle
// 单独存在时追加这行会破坏该承诺，且 spec 的 MUST 本身也只要求「同行人匹配时」产出依据；
// 本人风格仍受 system prompt 里「偏好要落实在选点上」与 preferenceBasis 契约约束，不会退化成软参考。
const REFLECTION_REQUIREMENT =
  "落实要求：上面每条偏好都要落到具体选点上，并在对应 step 的 preferenceBasis 里点名是哪条偏好、" +
  "因此选或避开了什么。例如注重洁净/洁癖 → 避开露天摊位、优先可预订或室内餐饮；" +
  "服务型/先订备选方案 → 段与段之间留缓冲、不安排需要赶车的衔接。对应不上的 step 必须填 null。";

// 草稿预算必须同时容纳「思考」与「正文」：默认供应商 deepseek-v4-flash 是 reasoning 模型，
// 两者共用同一个 completion 预算。历史：1200 会把 2 天行程的 JSON 拦腰截断（2026-10-11 提到 4000）。
// 2026-10-16 FU-21 实测 4000 已不够：同一句「我和莱卡恩去泉州两天」连调三次，两次顶格
// （completion=4000）——一次 reasoning 独自吃掉约 3800 token、正文只写出 303 字就被截断，
// 另一次 reasoning 吃满 4000、content 直接为空（finish_reason=length）；只有第三次（2555）
// 完整收尾。即失败率约 2/3，行程规划对用户基本不可用。按实际 token 计费，提高上限不增加
// 正常调用成本，只是不再被卡死。6000 = 观测到的最坏 reasoning（约 3800）+ 2 天行程正文
// （约 900-1200 token）+ 余量。同一条教训 2026-09-23 运营建议正文、2026-10-11 行程草稿各踩过一次。
//
// 另注意：预算不是本路径唯一的坑。AI_TIMEOUT_MS 默认值曾为 20000ms，对 reasoning 模型同样
// 太短——实测同一次草稿请求 raw 耗时 11-25s，超过 20s 即被 abort 成 PARSE「Provider returned
// malformed JSON」（与预算无关，是超时）。2026-10-20 已把 DEFAULT_TIMEOUT_MS 抬到 60000
// （packages/ai-sdk/src/factory.ts），显式设 AI_TIMEOUT_MS 仍优先生效。
const TRIP_DRAFT_MAX_TOKENS = 6000;

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
              // 草稿侧宽松（nullish）：模型漏填与显式 null 等价，交给下面统一规整
              preferenceBasis: z.string().nullish(),
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

// FU-20：同行人解析——按 Profile.name 在（已消毒）消息中精确出现判定，取最先提到的一个。
// 候选集已由 profileService 排除登录用户本人；无人名命中返回 null，调用方按无同行人降级。
function findCompanion(text: string, candidates: CompanionCandidate[]): CompanionCandidate | null {
  let matched: CompanionCandidate | null = null;
  let matchedIndex = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!candidate.name) {
      continue;
    }
    const index = text.indexOf(candidate.name);
    if (index === -1 || index >= matchedIndex) {
      continue;
    }
    matched = candidate;
    matchedIndex = index;
  }
  return matched;
}

// FU-20：同行人画像行——只拼非空字段，全空则不产出行（与无同行人时逐字一致）。
function buildCompanionLine(companion: CompanionCandidate): string {
  const segments: string[] = [];
  if (companion.travelStyle) {
    segments.push(`旅行风格「${companion.travelStyle}」`);
  }
  if (companion.styleTags.length > 0) {
    segments.push(`风格标签「${companion.styleTags.join("、")}」`);
  }
  if (companion.dietPreference) {
    segments.push(`饮食偏好「${companion.dietPreference}」`);
  }
  if (companion.avoidFood.length > 0) {
    segments.push(`忌口「${companion.avoidFood.join("、")}」`);
  }
  if (segments.length === 0) {
    return "";
  }
  return `同行人${companion.name}的偏好：${segments.join("；")}。`;
}

async function draftTrip(
  text: string,
  travelStyle: string | null,
  companion: CompanionCandidate | null,
): Promise<TripDraft | null> {
  if (!text) {
    return null;
  }
  // 上下文行顺序固定：本人旅行风格在前、同行人在后；无同行人时与改动前逐字一致
  const contextLines: string[] = [];
  if (travelStyle) {
    contextLines.push(`用户画像旅行风格：${travelStyle}。`);
  }
  const companionLine = companion ? buildCompanionLine(companion) : "";
  if (companionLine) {
    contextLines.push(companionLine);
    // 落实要求紧贴同行人偏好行：没有可落实的偏好时不追加，无同行人的 user 消息因此逐字不变
    contextLines.push(REFLECTION_REQUIREMENT);
  }
  const messages = [
    { role: "system" as const, content: TRIP_SYSTEM_PROMPT },
    { role: "user" as const, content: `${contextLines.join("")}用户说：「${text}」` },
  ];
  // 严格 JSON 输出：低温度提高稳定性；失败重试两次再降级（模型偶发非法 JSON/截断）
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await tryChat("agent.trip", messages, {
      maxTokens: TRIP_DRAFT_MAX_TOKENS,
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

// 草稿里的依据规整为 TripPoi 形状：缺失、空串、纯空白一律归 null。空串若直接落库会绕过 shared
// 的 .min(1)，等会话回放/详情解析时才炸，那时已经查不出是哪一步写坏的，故在此一次性收口。
function toPreferenceBasis(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export async function planTripTool(input: {
  userId: string;
  message: string;
}): Promise<PlanTripToolResult> {
  const text = sanitizeUserInput(input.message);
  const profile = await profileService.getByUserId(input.userId).catch(() => null);

  // FU-20：同行人画像解析。候选查询失败时降级为空列表（按无同行人规划），不阻塞主流程。
  let companion: CompanionCandidate | null = null;
  if (text) {
    const candidates = await profileService
      .listCompanionCandidates(input.userId)
      .catch(() => [] as CompanionCandidate[]);
    companion = findCompanion(text, candidates);
  }

  const draft = await draftTrip(text, profile?.travelStyle ?? null, companion);
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
          preferenceBasis: toPreferenceBasis(step.preferenceBasis),
          location: { lng: found.location.lng, lat: found.location.lat },
          validated: true,
        });
      } else {
        daySteps.push({
          name: step.poi,
          category: step.category,
          time: step.time,
          note: step.note ?? null,
          preferenceBasis: toPreferenceBasis(step.preferenceBasis),
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
        // 同行人是行程事实的一部分，与行程写入同一事务：不允许「行程在、同行人丢」的中间态。
        // 快照两列（无外键）：画像名可能已改、persona 可能已删，行程要留住当时和谁一起去。
        ...(companion ? { companionName: companion.name, companionUserId: companion.userId } : {}),
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
        // FU-20：记录命中的同行人（未命中时与改动前逐字一致），便于排查画像注入效果
        ...(companion ? { companionName: companion.name, companionUserId: companion.userId } : {}),
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
        // FU-20 解析结果随结果一起带出（不重新解析）：回复据此把偏好归属到人，REST/回放据此展示
        companion: companion ? { name: companion.name, userId: companion.userId } : null,
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

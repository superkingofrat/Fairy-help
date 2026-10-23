import { z } from "zod";
import { prisma } from "@fairy/database";
import type { TripDetail, TripListItem, TripResult } from "@fairy/shared";
import { itineraryDaySchema, tripDetailSchema } from "@fairy/shared";
import { planTripTool } from "../tools/planTripTool";

// FU-19（旅行规划二期）：行程 REST 服务层。
// create 复用 chat 的 planTripTool 同一链路（LLM 草稿 → 高德校验 → 事务落库 → 行为日志），
// 不造第二套行程生成实现；读取只做投影，不回写任何状态。

export type CreateTripOutcome =
  { ok: true; trip: TripResult } | { ok: false; code: "TRIP_UNRESOLVED" | "TRIP_DRAFT_FAILED" };

// 结构化请求降级为自然语言消息：destination 走 DESTINATION_PATTERNS 可稳定提取，
// days 以「N 天」写入消息供草稿链路推断（缺省时由 LLM 自行决定，保持一期行为）。
function composeMessage(destination: string, days?: number): string {
  const span = days ? ` ${days} 天的` : "";
  return `帮我规划${span}${destination}行程`;
}

export async function createTrip(
  userId: string,
  input: { destination: string; days?: number },
): Promise<CreateTripOutcome> {
  const result = await planTripTool({
    userId,
    message: composeMessage(input.destination, input.days),
  });

  if (!result.success) {
    // 草稿链路失败：TRIP_DRAFT_FAILED（LLM 侧）；其余按未解析处理（ destination 已必填，理论不可达）。
    return {
      ok: false,
      code: result.error === "TRIP_DRAFT_FAILED" ? "TRIP_DRAFT_FAILED" : "TRIP_UNRESOLVED",
    };
  }
  if ("unresolved" in result.data) {
    return { ok: false, code: "TRIP_UNRESOLVED" };
  }
  return { ok: true, trip: result.data };
}

export async function listTrips(
  userId: string,
  query: { page: number; limit: number },
): Promise<{ items: TripListItem[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.trip.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.trip.count({ where: { userId } }),
  ]);

  const items: TripListItem[] = rows.map((row) => ({
    id: row.id,
    destination: row.destination,
    days: row.days,
    validated: hasValidatedStep(row.itinerary),
    createdAt: row.createdAt.toISOString(),
  }));

  return { items, total };
}

// 投影 + 归属（ownerId 仅供 controller 做本人/admin 判定，不下发 HTTP 响应）。
export async function getTripDetail(
  tripId: string,
): Promise<{ trip: TripDetail; ownerId: string } | null> {
  const row = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!row) {
    return null;
  }

  const parsed = tripDetailSchema.safeParse({
    tripId: row.id,
    destination: row.destination,
    days: row.days,
    itinerary: row.itinerary,
    route: row.route ?? null,
    validated: hasValidatedStep(row.itinerary),
    createdAt: row.createdAt.toISOString(),
    // 两列缺一即按无同行人（回填可能只补上一列，或本期前创建的行程本就无同行人）——
    // 契约层只见到完整对象或 null，前端两态判断即可。
    companion:
      row.companionName && row.companionUserId
        ? { name: row.companionName, userId: row.companionUserId }
        : null,
  });
  if (!parsed.success) {
    return null;
  }
  return { trip: parsed.data, ownerId: row.userId };
}

// Trip 表无 validated 列（FU-13 起该标志在 POI 级）；列表/详情投影时从 itinerary JSON 派生。
const itineraryArraySchema = z.array(itineraryDaySchema);
function hasValidatedStep(itinerary: unknown): boolean {
  const parsed = itineraryArraySchema.safeParse(itinerary);
  return parsed.success && parsed.data.some((day) => day.steps.some((step) => step.validated));
}

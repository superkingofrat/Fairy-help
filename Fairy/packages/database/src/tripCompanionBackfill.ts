/**
 * 存量行程同行人回填的纯函数部分（无 IO、无 import 副作用，可单测）。
 *
 * scripts/backfill-trip-companions.ts 从 TRIP_PLANNED 日志的 JSONB payload 里恢复同行人快照。
 * payload 是历史数据：早期写入可能缺键、值可能不是字符串，因此在碰数据库之前必须先在这里把
 * 形状收敛成几种明确结果——否则「半个快照」（有姓名没有 userId）会被写进 trips 表，
 * 而契约层要求两列缺一即视为无同行人。
 */

export interface CompanionSnapshot {
  tripId: string;
  name: string;
  userId: string;
}

export type CompanionPayloadRead =
  | { kind: "companion"; snapshot: CompanionSnapshot }
  /** 只有姓名没有 userId：无法定位画像，也不能只写半截快照，跳过并单独计数 */
  | { kind: "name-only" }
  /** payload 无 companionName：该次规划未命中同行人（FU-20 未命中时不写这两个键） */
  | { kind: "no-companion" }
  /** payload 形状损坏（非对象、或缺 tripId）：无法定位行程，按失败计数并告警 */
  | { kind: "malformed" };

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readCompanionFromPayload(payload: unknown): CompanionPayloadRead {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { kind: "malformed" };
  }
  const record = payload as Record<string, unknown>;

  const tripId = nonEmptyString(record.tripId);
  if (tripId === null) {
    return { kind: "malformed" };
  }

  const name = nonEmptyString(record.companionName);
  if (name === null) {
    return { kind: "no-companion" };
  }

  const userId = nonEmptyString(record.companionUserId);
  if (userId === null) {
    return { kind: "name-only" };
  }

  return { kind: "companion", snapshot: { tripId, name, userId } };
}

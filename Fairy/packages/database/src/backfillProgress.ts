/**
 * 回填进度的纯函数 helpers（无 IO、无 import 副作用，可单测）。
 *
 * backfill-memory-embeddings.ts 的主循环按 `embedding IS NULL` 选取行，
 * 而「跳过（空内容）」与「失败（embed 报错）」的行不会被写回 embedding——
 * 若不记住已尝试过的 id，下一批会把它们反复取回，主循环永远跑不完。
 */

export interface PendingRow {
  id: string;
  content: string;
}

/**
 * 从本批待处理行中筛掉已尝试过的 id，返回真正需要处理的新鲜行。
 * 已尝试 = 本轮中已 embed 成功、跳过或失败过的行；它们仍满足
 * `embedding IS NULL`，但重试不会产生新结果，必须排除以防无限循环。
 */
export function selectFreshRows<T extends PendingRow>(
  pending: T[],
  attemptedIds: Set<string>,
): T[] {
  return pending.filter((row) => !attemptedIds.has(row.id));
}

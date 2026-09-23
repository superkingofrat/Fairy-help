import { z } from "zod";

// 2026-09-23-proactive-ops-suggestions：主动运营建议共享契约。
// 服务端 suggestionService 生成/落库、调度器触发、管理端 SuggestionFeed 消费同一形状；
// sourceData 为触发时的真实聚合快照（只含影片/库存/聚合数字，无用户隐私字段），
// 供审计与 LLM 降级核对（AC-4 数字一致性），形状随 kind 而变，按 memoryRecord.metadata
// 先例以 unknown 承载任意 JSON。

export const SUGGESTION_KINDS = ["LOW_STOCK", "BORROW_RATIO", "DORMANT", "DAILY_REPORT"] as const;

export const suggestionKindSchema = z.enum(SUGGESTION_KINDS);

export const suggestionSchema = z.object({
  id: z.string(),
  kind: suggestionKindSchema,
  summary: z.string().min(1),
  body: z.string().min(1),
  sourceData: z.unknown(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const suggestionListPaginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export const suggestionListFeedSchema = z.object({
  items: z.array(suggestionSchema),
  pagination: suggestionListPaginationSchema,
});

export const suggestionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const unreadCountSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type SuggestionKind = z.infer<typeof suggestionKindSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type SuggestionListPagination = z.infer<typeof suggestionListPaginationSchema>;
export type SuggestionListFeed = z.infer<typeof suggestionListFeedSchema>;
export type SuggestionListQuery = z.infer<typeof suggestionListQuerySchema>;
export type UnreadCount = z.infer<typeof unreadCountSchema>;

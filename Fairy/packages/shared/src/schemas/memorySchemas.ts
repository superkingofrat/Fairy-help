import { z } from "zod";

// FU-14：记忆中心共享契约——记忆 kind 枚举、记忆记录、LLM 抽取结果。
// 一期为内部类型（无 REST 端点）；memoryService 落库 / memoryExtractor 产出 / contextBuilder 注入共用。
// FU-15：新增 admin 管理面契约（列表查询/列表项/手动新增/编辑），经 /api/memories 暴露（admin-only）。

export const memoryKindSchema = z.enum(["preference", "fact", "intent"]);

export const memoryRecordSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  sessionId: z.string().nullable(),
  kind: memoryKindSchema,
  content: z.string().min(1),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});

export const memoryExtractionSchema = z.object({
  memories: z
    .array(
      z.object({
        kind: memoryKindSchema,
        content: z.string().min(1),
      })
    )
    .max(10),
  // FU-18：画像反向回写——LLM 每轮额外输出本轮对话体现的偏好类型（最多 3 个）。
  // 语义上等同于 preference 记忆的浓缩；代码侧以 Movie.genres 枚举白名单过滤后才落 Profile.likeGenres。
  genres: z.array(z.string().trim().min(1)).max(3).optional(),
});

// FU-15 管理面：GET /api/memories 列表项（join Profile→User 带 email；userId == Memory.profileId）
export const memoryListItemSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  email: z.string(),
  kind: memoryKindSchema,
  content: z.string().min(1),
  sessionId: z.string().nullable(),
  createdAt: z.string(),
});

export const memoryListPaginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export const memoryListFeedSchema = z.object({
  items: z.array(memoryListItemSchema),
  pagination: memoryListPaginationSchema,
});

export const memoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().optional(),
  kind: memoryKindSchema.optional(),
  keyword: z.string().trim().max(100).optional(),
});

// FU-17 自查面：GET /api/memories/me 的查询与列表项——本人只读，无 userId/email；
// zod 默认剥除未知键 → 客户端即使传 userId/email 也会被忽略（身份一律以 token 为准）。
export const memorySelfQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kind: memoryKindSchema.optional(),
  keyword: z.string().trim().max(100).optional(),
});

export const memorySelfListItemSchema = z.object({
  id: z.string(),
  kind: memoryKindSchema,
  content: z.string().min(1),
  sessionId: z.string().nullable(),
  createdAt: z.string(),
});

export const memorySelfListFeedSchema = z.object({
  items: z.array(memorySelfListItemSchema),
  pagination: memoryListPaginationSchema,
});

export const memoryCreateSchema = z.object({
  userId: z.string().uuid(),
  kind: memoryKindSchema,
  content: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
});

export const memoryUpdateSchema = z
  .object({
    kind: memoryKindSchema.optional(),
    content: z.string().min(1).max(2000).optional(),
  })
  .refine((body) => body.kind !== undefined || body.content !== undefined, {
    message: "至少提供 kind 或 content 之一",
  });

export type MemoryKind = z.infer<typeof memoryKindSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;
export type MemoryListItem = z.infer<typeof memoryListItemSchema>;
export type MemoryListPagination = z.infer<typeof memoryListPaginationSchema>;
export type MemoryListFeed = z.infer<typeof memoryListFeedSchema>;
export type MemoryQuery = z.infer<typeof memoryQuerySchema>;
export type MemorySelfQuery = z.infer<typeof memorySelfQuerySchema>;
export type MemorySelfListItem = z.infer<typeof memorySelfListItemSchema>;
export type MemorySelfListFeed = z.infer<typeof memorySelfListFeedSchema>;
export type MemoryCreateInput = z.infer<typeof memoryCreateSchema>;
export type MemoryUpdateInput = z.infer<typeof memoryUpdateSchema>;


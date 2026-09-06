import { z } from "zod";

// FU-14：记忆中心共享契约——记忆 kind 枚举、记忆记录、LLM 抽取结果。
// 一期为内部类型（无 REST 端点）；memoryService 落库 / memoryExtractor 产出 / contextBuilder 注入共用。

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
});

export type MemoryKind = z.infer<typeof memoryKindSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;

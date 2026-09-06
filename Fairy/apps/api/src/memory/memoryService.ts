import { prisma } from "@fairy/database";
import type { MemoryKind, MemoryRecord } from "@fairy/shared";

// FU-14：记忆中心——结构化记忆的落库与检索（按 profileId 用户隔离，时间倒序 + 限量）。
// 调用方负责降级：本服务方法失败向上抛，由对话链路统一 catch（不中断响应）。

const KIND_TO_PRISMA: Record<MemoryKind, "PREFERENCE" | "FACT" | "INTENT"> = {
  preference: "PREFERENCE",
  fact: "FACT",
  intent: "INTENT",
};

export interface AddMemoryInput {
  profileId: string;
  sessionId?: string;
  kind: MemoryKind;
  content: string;
  metadata?: unknown;
}

export interface SearchMemoriesOptions {
  kind?: MemoryKind;
  limit?: number;
  keyword?: string;
}

export async function addMemory(input: AddMemoryInput): Promise<MemoryRecord> {
  const record = await prisma.memory.create({
    data: {
      profileId: input.profileId,
      sessionId: input.sessionId ?? null,
      kind: KIND_TO_PRISMA[input.kind],
      content: input.content,
      metadata: (input.metadata as object | null | undefined) ?? undefined,
    },
  });
  return toMemoryRecord(record);
}

export async function searchMemories(
  profileId: string,
  options: SearchMemoriesOptions = {}
): Promise<MemoryRecord[]> {
  const records = await prisma.memory.findMany({
    where: {
      profileId,
      ...(options.kind ? { kind: KIND_TO_PRISMA[options.kind] } : {}),
      ...(options.keyword ? { content: { contains: options.keyword } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 5,
  });
  return records.map(toMemoryRecord);
}

function toMemoryRecord(record: {
  id: string;
  profileId: string;
  sessionId: string | null;
  kind: "PREFERENCE" | "FACT" | "INTENT";
  content: string;
  metadata: unknown;
  createdAt: Date;
}): MemoryRecord {
  return {
    id: record.id,
    profileId: record.profileId,
    sessionId: record.sessionId,
    kind: record.kind.toLowerCase() as MemoryKind,
    content: record.content,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
  };
}

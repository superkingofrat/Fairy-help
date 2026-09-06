import { Prisma, prisma } from "@fairy/database";
import type {
  MemoryCreateInput,
  MemoryKind,
  MemoryListItem,
  MemoryQuery,
  MemoryRecord,
  MemoryUpdateInput,
} from "@fairy/shared";

// FU-14：记忆中心——结构化记忆的落库与检索（按 profileId 用户隔离，时间倒序 + 限量）。
// 调用方负责降级：本服务方法失败向上抛，由对话链路统一 catch（不中断响应）。
// FU-15：管理面——listMemories/createMemory/updateMemory/deleteMemory（admin 专用）。

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

// FU-15：admin 全量列表——Memory.profileId 即 User.id（Profile 以 userId 为主键），
// join Profile→User 一次带出 email；按 userId/kind/keyword 过滤 + createdAt 倒序 + 分页。
export async function listMemories(
  query: MemoryQuery
): Promise<{ items: MemoryListItem[]; total: number }> {
  const where: Prisma.MemoryWhereInput = {
    ...(query.userId ? { profileId: query.userId } : {}),
    ...(query.kind ? { kind: KIND_TO_PRISMA[query.kind] } : {}),
    ...(query.keyword ? { content: { contains: query.keyword } } : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [records, total] = await Promise.all([
    prisma.memory.findMany({
      where,
      include: {
        profile: { include: { user: { select: { email: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.memory.count({ where }),
  ]);

  const items: MemoryListItem[] = records.map((record) => ({
    id: record.id,
    userId: record.profileId,
    email: record.profile.user.email,
    kind: record.kind.toLowerCase() as MemoryKind,
    content: record.content,
    sessionId: record.sessionId,
    createdAt: record.createdAt.toISOString(),
  }));

  return { items, total };
}

export async function createMemory(
  input: MemoryCreateInput
): Promise<{ ok: true; record: MemoryRecord } | { ok: false; code: "PROFILE_NOT_FOUND" }> {
  // Memory.profileId 外键指向 Profile.userId：目标用户须已建 Profile，否则落库会 P2003。
  const profile = await prisma.profile.findUnique({
    where: { userId: input.userId },
    select: { userId: true },
  });
  if (!profile) {
    return { ok: false, code: "PROFILE_NOT_FOUND" };
  }

  try {
    const record = await prisma.memory.create({
      data: {
        profileId: input.userId,
        sessionId: input.sessionId ?? null,
        kind: KIND_TO_PRISMA[input.kind],
        content: input.content,
      },
    });
    return { ok: true, record: toMemoryRecord(record) };
  } catch (error) {
    // Profile 在预检与落库之间被删（级联）的窗口：按不存在处理，不抛 500。
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2025")
    ) {
      return { ok: false, code: "PROFILE_NOT_FOUND" };
    }
    throw error;
  }
}

export async function updateMemory(
  id: string,
  patch: MemoryUpdateInput
): Promise<MemoryRecord | null> {
  try {
    const record = await prisma.memory.update({
      where: { id },
      data: {
        ...(patch.kind !== undefined ? { kind: KIND_TO_PRISMA[patch.kind] } : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
      },
    });
    return toMemoryRecord(record);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  const existing = await prisma.memory.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return false;
  }

  await prisma.memory.delete({ where: { id } });
  return true;
}

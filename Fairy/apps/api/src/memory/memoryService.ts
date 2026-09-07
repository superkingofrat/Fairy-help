import { Prisma, prisma } from "@fairy/database";
import type {
  MemoryCreateInput,
  MemoryKind,
  MemoryListItem,
  MemoryQuery,
  MemoryRecord,
  MemoryUpdateInput,
} from "@fairy/shared";
import { embedContent } from "./embeddingClient";

// FU-14：记忆中心——结构化记忆的落库与检索（按 profileId 用户隔离，时间倒序 + 限量）。
// 调用方负责降级：本服务方法失败向上抛，由对话链路统一 catch（不中断响应）。
// FU-15：管理面——listMemories/createMemory/updateMemory/deleteMemory（admin 专用）。
// FU-16：向量召回——searchMemories 混合检索（向量为主 + 结构化兜底/补齐）；新记忆落库后实时 embed（失败静默）。
//   embedding 列由 Prisma 声明为 Unsupported，读写一律 raw SQL（$queryRaw/$executeRaw），永不下发到 DTO。

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
  /** 语义召回查询文本（通常为用户当前消息）。缺省/空白时退化为纯结构化检索。 */
  query?: string;
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
  // FU-16：落库后实时生成 embedding 写回；失败静默（仅日志），记忆本体不受影响。
  await refreshEmbeddingQuietly(record.id, record.content);
  return toMemoryRecord(record);
}

export async function searchMemories(
  profileId: string,
  options: SearchMemoriesOptions = {},
): Promise<MemoryRecord[]> {
  const limit = options.limit ?? 5;
  const query = options.query?.trim();
  const baseFilters = { kind: options.kind, keyword: options.keyword };

  if (query) {
    // embedContent 契约：内部失败返回 null（降级信号），此处仅兜底 mock/未知异常。
    const vector = await embedContent(query).catch(() => null);
    if (vector) {
      const rows = await prisma.$queryRaw<VectorRow[]>(
        buildVectorQuery(profileId, vector, options, limit),
      );
      if (rows.length > 0) {
        const ranked = rows.slice(0, limit).map(toVectorRecord);
        if (ranked.length >= limit) {
          return ranked;
        }
        // 向量召回不足 limit：按时间倒序补齐（排除已召回 id，避免重复）。
        const excludedIds = ranked.map((record) => record.id);
        const rest = await findStructured(profileId, {
          ...baseFilters,
          excludeIds: excludedIds,
          take: limit - ranked.length,
        });
        return [...ranked, ...rest];
      }
      // 一条向量都没命中（如全表尚未回填）→ 直接落到结构化路径。
    }
  }

  return findStructured(profileId, { ...baseFilters, take: limit });
}

/** FU-14 原有结构化检索：profileId 必填 + kind/keyword 过滤 + 时间倒序 + take。 */
async function findStructured(
  profileId: string,
  filters: {
    kind?: MemoryKind;
    keyword?: string;
    excludeIds?: string[];
    take: number;
  },
): Promise<MemoryRecord[]> {
  const records = await prisma.memory.findMany({
    where: {
      profileId,
      ...(filters.kind ? { kind: KIND_TO_PRISMA[filters.kind] } : {}),
      ...(filters.keyword ? { content: { contains: filters.keyword } } : {}),
      ...(filters.excludeIds && filters.excludeIds.length > 0
        ? { id: { notIn: filters.excludeIds } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters.take,
  });
  return records.map(toMemoryRecord);
}

interface VectorRow {
  id: string;
  profileId: string;
  sessionId: string | null;
  kind: "PREFERENCE" | "FACT" | "INTENT";
  content: string;
  metadata: unknown;
  createdAt: Date | string;
}

/** FU-16：向量检索——cosine 距离升序（`<=>` 越小越相似），profileId 必填隔离，kind/keyword 作预过滤。 */
function buildVectorQuery(
  profileId: string,
  vector: number[],
  options: SearchMemoriesOptions,
  limit: number,
): Prisma.Sql {
  const literal = `[${vector.join(",")}]`;
  const kindSql = options.kind
    ? Prisma.sql`AND "kind" = ${KIND_TO_PRISMA[options.kind]}`
    : Prisma.empty;
  const keywordSql = options.keyword
    ? Prisma.sql`AND "content" LIKE ${`%${options.keyword}%`}`
    : Prisma.empty;
  return Prisma.sql`
    SELECT "id", "profileId", "sessionId", "kind", "content", "metadata", "createdAt"
    FROM "memories"
    WHERE "profileId" = ${profileId}
      AND "embedding" IS NOT NULL
      ${kindSql}
      ${keywordSql}
    ORDER BY "embedding" <=> ${literal}::vector
    LIMIT ${limit}
  `;
}

/** raw 行映射：raw 查询下 jsonb 可能以字符串返回，规范化回 JSON 值再走共享 mapper。 */
function toVectorRecord(row: VectorRow): MemoryRecord {
  const metadata =
    typeof row.metadata === "string"
      ? parseRawJson(row.metadata)
      : row.metadata;
  return toMemoryRecord({ ...row, metadata });
}

function parseRawJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** FU-16：embed 成功则 raw UPDATE 写回 embedding 列；任何失败只记日志，不抛给调用方。 */
async function refreshEmbeddingQuietly(
  memoryId: string,
  content: string,
): Promise<void> {
  const vector = await embedContent(content).catch(() => null);
  if (!vector) {
    return;
  }
  try {
    const literal = `[${vector.join(",")}]`;
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "memories" SET "embedding" = ${literal}::vector WHERE "id" = ${memoryId}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(
      `[memory-embedding] write-back failed for memory ${memoryId}: ${message}`,
    );
  }
}

function toMemoryRecord(record: {
  id: string;
  profileId: string;
  sessionId: string | null;
  kind: "PREFERENCE" | "FACT" | "INTENT";
  content: string;
  metadata: unknown;
  createdAt: Date | string;
}): MemoryRecord {
  return {
    id: record.id,
    profileId: record.profileId,
    sessionId: record.sessionId,
    kind: record.kind.toLowerCase() as MemoryKind,
    content: record.content,
    metadata: record.metadata,
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : new Date(record.createdAt).toISOString(),
  };
}

// FU-15：admin 全量列表——Memory.profileId 即 User.id（Profile 以 userId 为主键），
// join Profile→User 一次带出 email；按 userId/kind/keyword 过滤 + createdAt 倒序 + 分页。
export async function listMemories(
  query: MemoryQuery,
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
  input: MemoryCreateInput,
): Promise<
  { ok: true; record: MemoryRecord } | { ok: false; code: "PROFILE_NOT_FOUND" }
> {
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
    // FU-16：admin 新落库的记忆同样实时生成 embedding（spec「新写入即回填」）。
    await refreshEmbeddingQuietly(record.id, record.content);
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
  patch: MemoryUpdateInput,
): Promise<MemoryRecord | null> {
  try {
    const record = await prisma.memory.update({
      where: { id },
      data: {
        ...(patch.kind !== undefined
          ? { kind: KIND_TO_PRISMA[patch.kind] }
          : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
      },
    });
    return toMemoryRecord(record);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }
    throw error;
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  const existing = await prisma.memory.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return false;
  }

  await prisma.memory.delete({ where: { id } });
  return true;
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, type Memory } from "@fairy/database";
import {
  addMemory,
  createMemory,
  deleteMemory,
  listMemories,
  listOwnMemories,
  searchMemories,
  updateMemory,
} from "../memory/memoryService";
import { embedContent } from "../memory/embeddingClient";

const { MockPrismaClientKnownRequestError } = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return { MockPrismaClientKnownRequestError };
});

vi.mock("@fairy/database", () => {
  // 模拟 Prisma.sql 模板的嵌套展平：插值的 SQL 片段（kind/keyword 预过滤）会并入 strings，
  // 参数（profileId、枚举、literal、limit）按真实顺序进入 values，便于断言整条 SQL。
  const appendFragment = (
    fragment: { strings: string[]; values: unknown[] },
    out: { strings: string[]; values: unknown[] },
  ): void => {
    for (let i = 0; i < fragment.values.length; i += 1) {
      out.strings.push(fragment.strings[i]);
      const value = fragment.values[i];
      if (
        typeof value === "object" &&
        value !== null &&
        Array.isArray((value as { strings?: unknown }).strings) &&
        Array.isArray((value as { values?: unknown }).values)
      ) {
        appendFragment(value as { strings: string[]; values: unknown[] }, out);
      } else {
        out.values.push(value);
      }
    }
    out.strings.push(fragment.strings[fragment.strings.length - 1]);
  };

  return {
    prisma: {
      memory: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      profile: {
        findUnique: vi.fn(),
      },
      // FU-16：向量写入（$executeRaw）与检索（$queryRaw）走 raw SQL；sql 模板降级为可断言的 { strings, values }。
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
    },
    Prisma: {
      PrismaClientKnownRequestError: MockPrismaClientKnownRequestError,
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
        const out: { strings: string[]; values: unknown[] } = {
          strings: [],
          values: [],
        };
        appendFragment({ strings: [...strings], values }, out);
        return out;
      },
      empty: { strings: [""], values: [] },
    },
  };
});

// FU-16：embed 边界整体 mock（真实 embed 由 embeddingClient 单测/真机覆盖，这里禁真实 API）。
vi.mock("../memory/embeddingClient", () => ({
  embedContent: vi.fn(),
}));
// 默认“无 embed 能力”→ 结构化路径；需要向量路径的用例在 it 内覆盖 mockResolvedValue。
vi.mocked(embedContent).mockResolvedValue(null);

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_PROFILE_ID = "00000000-0000-4000-8000-000000000002";

function prismaRecord(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    profileId: PROFILE_ID,
    sessionId: null,
    kind: "PREFERENCE",
    content: "喜欢科幻片",
    metadata: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  };
}

// FU-16 测试伪向量：1536 维 + 可读的向量字面量，用于断言 raw SQL 参数。
const VEC_1536 = Array.from({ length: 1536 }, (_, i) => (i + 1) / 1536);
const VEC_LITERAL = `[${VEC_1536.join(",")}]`;

interface VectorRow {
  id: string;
  profileId: string;
  sessionId: string | null;
  kind: "PREFERENCE" | "FACT" | "INTENT";
  content: string;
  metadata: unknown;
  createdAt: string | Date;
}

function vectorRow(overrides: Partial<VectorRow> = {}): VectorRow {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    profileId: PROFILE_ID,
    sessionId: null,
    kind: "PREFERENCE",
    content: "喜欢科幻片",
    metadata: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  };
}

function lastRawCall(mock: { mock: { calls: unknown[][] } }): {
  strings: string[];
  values: unknown[];
} {
  const arg = mock.mock.calls[0]?.[0] as {
    strings: string[];
    values: unknown[];
  };
  return { strings: arg.strings, values: arg.values };
}

const PROFILE_ROW = {
  userId: PROFILE_ID,
  name: "铃",
  avatarUrl: null,
  styleTags: [],
  likeGenres: ["科幻"],
  avoidFood: [],
  dietPreference: null,
  travelStyle: null,
  createdAt: new Date("2026-09-01T10:00:00Z"),
  updatedAt: new Date("2026-09-01T10:00:00Z"),
};

describe("memoryService.addMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a memory with the profileId and maps the kind to Prisma enum", async () => {
    vi.mocked(prisma.memory.create).mockResolvedValue(prismaRecord());

    const record = await addMemory({
      profileId: PROFILE_ID,
      kind: "preference",
      content: "喜欢科幻片",
    });

    expect(prisma.memory.create).toHaveBeenCalledWith({
      data: {
        profileId: PROFILE_ID,
        sessionId: null,
        kind: "PREFERENCE",
        content: "喜欢科幻片",
        metadata: undefined,
      },
    });
    expect(record).toMatchObject({
      profileId: PROFILE_ID,
      kind: "preference",
      content: "喜欢科幻片",
    });
    expect(record.createdAt).toBe("2026-09-01T10:00:00.000Z");
  });

  it("passes sessionId and metadata when provided", async () => {
    vi.mocked(prisma.memory.create).mockResolvedValue(prismaRecord({ sessionId: "sess-1" }));

    await addMemory({
      profileId: PROFILE_ID,
      sessionId: "sess-1",
      kind: "fact",
      content: "家住上海",
      metadata: { source: "chat" },
    });

    expect(prisma.memory.create).toHaveBeenCalledWith({
      data: {
        profileId: PROFILE_ID,
        sessionId: "sess-1",
        kind: "FACT",
        content: "家住上海",
        metadata: { source: "chat" },
      },
    });
  });
});

describe("memoryService.searchMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries by profileId, orders by recency and limits by default to 5", async () => {
    vi.mocked(prisma.memory.findMany).mockResolvedValue([prismaRecord()]);

    const records = await searchMemories(PROFILE_ID);

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: { profileId: PROFILE_ID },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    expect(records).toHaveLength(1);
  });

  it("applies kind and keyword filters when provided", async () => {
    vi.mocked(prisma.memory.findMany).mockResolvedValue([]);

    await searchMemories(PROFILE_ID, {
      kind: "intent",
      keyword: "杭州",
      limit: 3,
    });

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: {
        profileId: PROFILE_ID,
        kind: "INTENT",
        content: { contains: "杭州" },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
  });

  it("never leaks another profile's memories", async () => {
    vi.mocked(prisma.memory.findMany).mockResolvedValue([prismaRecord()]);

    const records = await searchMemories(OTHER_PROFILE_ID);

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: { profileId: OTHER_PROFILE_ID },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    expect(records.map((record) => record.profileId)).toEqual([PROFILE_ID]);
  });
});

describe("memoryService.listMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins the user email, maps kinds and returns a consistent total", async () => {
    const listRow = {
      ...prismaRecord(),
      profile: { user: { email: "user@fairy.local" } },
    };
    vi.mocked(prisma.memory.findMany).mockResolvedValue([listRow] as unknown as Memory[]);
    vi.mocked(prisma.memory.count).mockResolvedValue(1);

    const { items, total } = await listMemories({ page: 1, limit: 20 });

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: {},
      include: {
        profile: { include: { user: { select: { email: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
    expect(prisma.memory.count).toHaveBeenCalledWith({ where: {} });
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({
      userId: PROFILE_ID,
      email: "user@fairy.local",
      kind: "preference",
    });
  });

  it("applies userId/kind/keyword filters and pagination skip", async () => {
    vi.mocked(prisma.memory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.memory.count).mockResolvedValue(0);

    await listMemories({
      page: 3,
      limit: 10,
      userId: PROFILE_ID,
      kind: "fact",
      keyword: "上海",
    });

    expect(prisma.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          profileId: PROFILE_ID,
          kind: "FACT",
          content: { contains: "上海" },
        },
        skip: 20,
        take: 10,
      }),
    );
  });
});

describe("memoryService.listOwnMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the owner's rows without an email/userId join", async () => {
    vi.mocked(prisma.memory.findMany).mockResolvedValue([prismaRecord()] as unknown as Memory[]);
    vi.mocked(prisma.memory.count).mockResolvedValue(1);

    const { items, total } = await listOwnMemories(PROFILE_ID, {
      page: 1,
      limit: 20,
    });

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: { profileId: PROFILE_ID },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
    expect(prisma.memory.count).toHaveBeenCalledWith({
      where: { profileId: PROFILE_ID },
    });
    expect(total).toBe(1);
    expect(items[0]).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440000",
      kind: "preference",
      content: "喜欢科幻片",
      sessionId: null,
      createdAt: "2026-09-01T10:00:00.000Z",
    });
    expect(items[0]).not.toHaveProperty("email");
    expect(items[0]).not.toHaveProperty("userId");
  });

  it("applies kind/keyword filters and pagination skip within the owner scope", async () => {
    vi.mocked(prisma.memory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.memory.count).mockResolvedValue(0);

    await listOwnMemories(PROFILE_ID, {
      page: 3,
      limit: 10,
      kind: "fact",
      keyword: "上海",
    });

    expect(prisma.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          profileId: PROFILE_ID,
          kind: "FACT",
          content: { contains: "上海" },
        },
        orderBy: { createdAt: "desc" },
        skip: 20,
        take: 10,
      }),
    );
    // 不同 profileId 互不可见：where 必须始终限定调用方传入的 profileId。
    await listOwnMemories(OTHER_PROFILE_ID, { page: 1, limit: 20 });
    expect(prisma.memory.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { profileId: OTHER_PROFILE_ID },
      }),
    );
  });
});

describe("memoryService.createMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns PROFILE_NOT_FOUND when the profile does not exist", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);

    const result = await createMemory({
      userId: PROFILE_ID,
      kind: "preference",
      content: "喜欢科幻片",
    });

    expect(result).toEqual({ ok: false, code: "PROFILE_NOT_FOUND" });
    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it("persists a manual memory for an existing profile", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(PROFILE_ROW);
    vi.mocked(prisma.memory.create).mockResolvedValue(
      prismaRecord({ kind: "FACT", content: "家住上海" }),
    );

    const result = await createMemory({
      userId: PROFILE_ID,
      kind: "fact",
      content: "家住上海",
      sessionId: "sess-1",
    });

    expect(prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId: PROFILE_ID },
      select: { userId: true },
    });
    expect(prisma.memory.create).toHaveBeenCalledWith({
      data: {
        profileId: PROFILE_ID,
        sessionId: "sess-1",
        kind: "FACT",
        content: "家住上海",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record).toMatchObject({
        kind: "fact",
        profileId: PROFILE_ID,
      });
    }
  });

  it("maps a P2003 race (profile deleted meanwhile) to PROFILE_NOT_FOUND", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(PROFILE_ROW);
    vi.mocked(prisma.memory.create).mockRejectedValue(
      new MockPrismaClientKnownRequestError("P2003"),
    );

    const result = await createMemory({
      userId: PROFILE_ID,
      kind: "fact",
      content: "家住上海",
    });

    expect(result).toEqual({ ok: false, code: "PROFILE_NOT_FOUND" });
  });
});

describe("memoryService.updateMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates kind and content with enum mapping", async () => {
    vi.mocked(prisma.memory.update).mockResolvedValue(
      prismaRecord({ kind: "INTENT", content: "想周末去杭州" }),
    );

    const record = await updateMemory("mem-1", {
      kind: "intent",
      content: "想周末去杭州",
    });

    expect(prisma.memory.update).toHaveBeenCalledWith({
      where: { id: "mem-1" },
      data: { kind: "INTENT", content: "想周末去杭州" },
    });
    expect(record).toMatchObject({ kind: "intent", content: "想周末去杭州" });
  });

  it("returns null when the memory is missing (P2025)", async () => {
    vi.mocked(prisma.memory.update).mockRejectedValue(
      new MockPrismaClientKnownRequestError("P2025"),
    );

    const record = await updateMemory("missing", { content: "x" });

    expect(record).toBeNull();
  });
});

describe("memoryService.deleteMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when the memory does not exist", async () => {
    vi.mocked(prisma.memory.findUnique).mockResolvedValue(null);

    expect(await deleteMemory("missing")).toBe(false);
    expect(prisma.memory.delete).not.toHaveBeenCalled();
  });

  it("deletes an existing memory and returns true", async () => {
    vi.mocked(prisma.memory.findUnique).mockResolvedValue(prismaRecord());
    vi.mocked(prisma.memory.delete).mockResolvedValue(prismaRecord());

    expect(await deleteMemory("mem-1")).toBe(true);
    expect(prisma.memory.delete).toHaveBeenCalledWith({
      where: { id: "mem-1" },
    });
  });
});

describe("memoryService write-time embedding (FU-16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks 只清调用记录、不清实现；每例重置回“无 embed 能力”，需要向量路径的用例自行覆盖。
    vi.mocked(embedContent).mockResolvedValue(null);
  });

  it("embeds the persisted content via raw UPDATE when an embedding is available", async () => {
    vi.mocked(prisma.memory.create).mockResolvedValue(prismaRecord());
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);

    const record = await addMemory({
      profileId: PROFILE_ID,
      kind: "preference",
      content: "喜欢科幻片",
    });

    expect(embedContent).toHaveBeenCalledWith("喜欢科幻片");
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = lastRawCall(vi.mocked(prisma.$executeRaw));
    expect(sql.strings.join("")).toContain('UPDATE "memories"');
    expect(sql.strings.join("")).toContain('SET "embedding" = ');
    expect(sql.strings.join("")).toContain('::vector WHERE "id" = ');
    expect(sql.values).toContain(VEC_LITERAL);
    expect(sql.values).toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(record).toMatchObject({
      profileId: PROFILE_ID,
      content: "喜欢科幻片",
    });
  });

  it("keeps the memory row when the embedding write-back fails (log only)", async () => {
    vi.mocked(prisma.memory.create).mockResolvedValue(prismaRecord({ content: "家住上海" }));
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$executeRaw).mockRejectedValue(new Error("vector down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const record = await addMemory({
      profileId: PROFILE_ID,
      kind: "fact",
      content: "家住上海",
    });

    expect(record).toMatchObject({ content: "家住上海" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("write-back failed"));
    warn.mockRestore();
  });

  it("skips embedding entirely when no embed capability is configured", async () => {
    vi.mocked(prisma.memory.create).mockResolvedValue(prismaRecord());

    await addMemory({
      profileId: PROFILE_ID,
      kind: "preference",
      content: "喜欢科幻片",
    });

    expect(embedContent).toHaveBeenCalledWith("喜欢科幻片");
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("embeds admin-created memories (createMemory) the same way", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(PROFILE_ROW);
    vi.mocked(prisma.memory.create).mockResolvedValue(prismaRecord());
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);

    const result = await createMemory({
      userId: PROFILE_ID,
      kind: "preference",
      content: "喜欢科幻片",
    });

    expect(result.ok).toBe(true);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(embedContent).toHaveBeenCalledWith("喜欢科幻片");
  });

  it("re-embeds the edited content when updateMemory changes it", async () => {
    vi.mocked(prisma.memory.update).mockResolvedValue(prismaRecord({ content: "想周末去杭州" }));
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);

    await updateMemory("mem-1", { content: "想周末去杭州" });

    // 旧向量对应旧文本：编辑后不重算会让向量召回与内容静默不一致
    expect(embedContent).toHaveBeenCalledWith("想周末去杭州");
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = lastRawCall(vi.mocked(prisma.$executeRaw));
    expect(sql.values).toContain(VEC_LITERAL);
    expect(sql.values).toContain("550e8400-e29b-41d4-a716-446655440000");
  });

  it("keeps the existing vector when updateMemory only changes the kind", async () => {
    vi.mocked(prisma.memory.update).mockResolvedValue(prismaRecord({ kind: "INTENT" }));
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);

    await updateMemory("mem-1", { kind: "intent" });

    // 文本未变，向量仍有效：不重算
    expect(embedContent).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("memoryService.searchMemories hybrid retrieval (FU-16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 同上：默认“无 embed 能力”结构化路径，向量用例自行覆盖。
    vi.mocked(embedContent).mockResolvedValue(null);
  });

  function mockVectorRows(count: number, seedContent: string): VectorRow[] {
    return Array.from({ length: count }, (_, index) =>
      vectorRow({
        id: `vec-${index}`,
        content: `${seedContent}${index}`,
        createdAt: `2026-08-0${index + 1}T10:00:00.000Z`,
      }),
    );
  }

  it("ranks by cosine similarity via raw SQL and skips the structured path when the limit is met", async () => {
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$queryRaw).mockResolvedValue(mockVectorRows(5, "喜欢科幻"));

    const records = await searchMemories(PROFILE_ID, {
      query: "我喜欢什么类型的片子",
      kind: "preference",
      limit: 5,
    });

    expect(embedContent).toHaveBeenCalledWith("我喜欢什么类型的片子");
    const sql = lastRawCall(vi.mocked(prisma.$queryRaw));
    const text = sql.strings.join("");
    expect(text).toContain('FROM "memories"');
    expect(text).toContain('"profileId" = ');
    expect(text).toContain('"embedding" IS NOT NULL');
    expect(text).toContain('AND "kind" = ');
    expect(text).toContain('"embedding" <=> ');
    expect(text).toContain("::vector");
    expect(text).toContain("LIMIT");
    expect(sql.values[0]).toBe(PROFILE_ID);
    expect(JSON.stringify(sql.values)).toContain("PREFERENCE");
    expect(prisma.memory.findMany).not.toHaveBeenCalled();
    expect(records).toHaveLength(5);
    expect(records.map((record) => record.id)).toEqual([
      "vec-0",
      "vec-1",
      "vec-2",
      "vec-3",
      "vec-4",
    ]);
  });

  it("tops up short vector recall with recency results, excluding already-ranked ids", async () => {
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$queryRaw).mockResolvedValue(mockVectorRows(3, "科幻"));
    vi.mocked(prisma.memory.findMany).mockResolvedValue([
      prismaRecord({ id: "recent-2", content: "新近无关记忆" }),
      prismaRecord({ id: "recent-1", content: "再新记忆" }),
    ]);

    const records = await searchMemories(PROFILE_ID, {
      query: "科幻片推荐",
      keyword: "片",
      limit: 5,
    });

    const sql = lastRawCall(vi.mocked(prisma.$queryRaw));
    expect(sql.strings.join("")).toContain('AND "content" LIKE ');
    expect(JSON.stringify(sql.values)).toContain("%片%");
    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: {
        profileId: PROFILE_ID,
        content: { contains: "片" },
        id: { notIn: ["vec-0", "vec-1", "vec-2"] },
      },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    expect(records.map((record) => record.id)).toEqual([
      "vec-0",
      "vec-1",
      "vec-2",
      "recent-2",
      "recent-1",
    ]);
  });

  it("falls back to pure structured retrieval when no rows carry vectors yet", async () => {
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(prisma.memory.findMany).mockResolvedValue([prismaRecord()]);

    const records = await searchMemories(PROFILE_ID, { query: "科幻片" });

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: { profileId: PROFILE_ID },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    expect(records).toHaveLength(1);
  });

  it("uses the structured path when no embed capability is configured (query ignored)", async () => {
    vi.mocked(embedContent).mockResolvedValue(null);
    vi.mocked(prisma.memory.findMany).mockResolvedValue([prismaRecord()]);

    const records = await searchMemories(PROFILE_ID, { query: "科幻片" });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.memory.findMany).toHaveBeenCalled();
    expect(records).toHaveLength(1);
  });

  it("degrades to structured retrieval when embedding itself throws", async () => {
    vi.mocked(embedContent).mockRejectedValue(new Error("embed unreachable"));
    vi.mocked(prisma.memory.findMany).mockResolvedValue([prismaRecord()]);

    const records = await searchMemories(PROFILE_ID, { query: "科幻片" });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
  });

  it("keeps the vector query isolated to the requested profileId", async () => {
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([vectorRow({ profileId: OTHER_PROFILE_ID })]);

    await searchMemories(OTHER_PROFILE_ID, { query: "科幻片" });

    const sql = lastRawCall(vi.mocked(prisma.$queryRaw));
    expect(sql.values[0]).toBe(OTHER_PROFILE_ID);
  });

  it("caps the combined result at the requested limit", async () => {
    vi.mocked(embedContent).mockResolvedValue(VEC_1536);
    vi.mocked(prisma.$queryRaw).mockResolvedValue(mockVectorRows(3, "科幻"));

    const records = await searchMemories(PROFILE_ID, {
      query: "科幻",
      limit: 3,
    });

    expect(prisma.memory.findMany).not.toHaveBeenCalled();
    expect(records).toHaveLength(3);
    expect(sqlLimit(vi.mocked(prisma.$queryRaw))).toBe(3);
  });

  function sqlLimit(mock: { mock: { calls: unknown[][] } }): unknown {
    const arg = mock.mock.calls[0]?.[0] as { values: unknown[] };
    return arg.values[arg.values.length - 1];
  }
});

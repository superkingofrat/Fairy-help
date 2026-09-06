import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, type Memory } from "@fairy/database";
import {
  addMemory,
  createMemory,
  deleteMemory,
  listMemories,
  searchMemories,
  updateMemory,
} from "../memory/memoryService";

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

vi.mock("@fairy/database", () => ({
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
  },
  Prisma: {
    PrismaClientKnownRequestError: MockPrismaClientKnownRequestError,
  },
}));

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
    vi.mocked(prisma.memory.create).mockResolvedValue(
      prismaRecord({ sessionId: "sess-1" })
    );

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

    await searchMemories(PROFILE_ID, { kind: "intent", keyword: "杭州", limit: 3 });

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

    await listMemories({ page: 3, limit: 10, userId: PROFILE_ID, kind: "fact", keyword: "上海" });

    expect(prisma.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          profileId: PROFILE_ID,
          kind: "FACT",
          content: { contains: "上海" },
        },
        skip: 20,
        take: 10,
      })
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
      prismaRecord({ kind: "FACT", content: "家住上海" })
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
      expect(result.record).toMatchObject({ kind: "fact", profileId: PROFILE_ID });
    }
  });

  it("maps a P2003 race (profile deleted meanwhile) to PROFILE_NOT_FOUND", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(PROFILE_ROW);
    vi.mocked(prisma.memory.create).mockRejectedValue(
      new MockPrismaClientKnownRequestError("P2003")
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
      prismaRecord({ kind: "INTENT", content: "想周末去杭州" })
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
      new MockPrismaClientKnownRequestError("P2025")
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
    expect(prisma.memory.delete).toHaveBeenCalledWith({ where: { id: "mem-1" } });
  });
});

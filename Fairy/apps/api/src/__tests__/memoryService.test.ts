import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, type Memory } from "@fairy/database";
import { addMemory, searchMemories } from "../memory/memoryService";

vi.mock("@fairy/database", () => ({
  prisma: {
    memory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
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

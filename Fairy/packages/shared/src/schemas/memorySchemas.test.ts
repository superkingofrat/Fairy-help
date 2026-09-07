import { describe, expect, it } from "vitest";
import {
  memoryKindSchema,
  memoryRecordSchema,
  memoryExtractionSchema,
  memoryListItemSchema,
  memoryQuerySchema,
  memorySelfQuerySchema,
  memorySelfListItemSchema,
  memorySelfListFeedSchema,
  memoryCreateSchema,
  memoryUpdateSchema,
  memoryListFeedSchema,
} from "./memorySchemas";

describe("memoryKindSchema", () => {
  it("accepts the three kinds", () => {
    for (const kind of ["preference", "fact", "intent"]) {
      expect(memoryKindSchema.safeParse(kind).success).toBe(true);
    }
  });

  it("rejects unknown kinds", () => {
    expect(memoryKindSchema.safeParse("wish").success).toBe(false);
    expect(memoryKindSchema.safeParse(1).success).toBe(false);
  });
});

describe("memoryRecordSchema", () => {
  it("accepts a full record", () => {
    expect(
      memoryRecordSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        profileId: "00000000-0000-4000-8000-000000000001",
        sessionId: "550e8400-e29b-41d4-a716-446655440001",
        kind: "preference",
        content: "喜欢科幻片",
        metadata: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("accepts a nullable sessionId and metadata", () => {
    expect(
      memoryRecordSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        profileId: "00000000-0000-4000-8000-000000000001",
        sessionId: null,
        kind: "fact",
        content: "家住上海",
        metadata: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects empty content or missing profileId", () => {
    expect(
      memoryRecordSchema.safeParse({
        id: "x",
        profileId: "p",
        sessionId: null,
        kind: "fact",
        content: "",
        metadata: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      memoryRecordSchema.safeParse({
        id: "x",
        sessionId: null,
        kind: "fact",
        content: "家住上海",
        metadata: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("memoryExtractionSchema", () => {
  it("accepts an extraction with memories", () => {
    expect(
      memoryExtractionSchema.safeParse({
        memories: [
          { kind: "preference", content: "喜欢科幻片" },
          { kind: "intent", content: "想周末去杭州" },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts an empty extraction", () => {
    expect(memoryExtractionSchema.safeParse({ memories: [] }).success).toBe(true);
  });

  it("rejects invalid kinds or missing content", () => {
    expect(
      memoryExtractionSchema.safeParse({
        memories: [{ kind: "wish", content: "x" }],
      }).success,
    ).toBe(false);
    expect(
      memoryExtractionSchema.safeParse({ memories: [{ kind: "fact", content: "" }] })
        .success,
    ).toBe(false);
  });
});

describe("memoryQuerySchema", () => {
  it("coerces numeric defaults and accepts filters", () => {
    const parsed = memoryQuerySchema.safeParse({
      page: "2",
      limit: "50",
      userId: "00000000-0000-4000-8000-000000000001",
      kind: "preference",
      keyword: " 科幻 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(50);
      expect(parsed.data.keyword).toBe("科幻");
    }
  });

  it("defaults page/limit when absent", () => {
    const parsed = memoryQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.limit).toBe(20);
    }
  });

  it("rejects invalid kind or out-of-range limit", () => {
    expect(memoryQuerySchema.safeParse({ kind: "wish" }).success).toBe(false);
    expect(memoryQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(memoryQuerySchema.safeParse({ limit: "200" }).success).toBe(false);
  });
});

describe("memoryListItemSchema", () => {
  it("accepts a full admin list item", () => {
    expect(
      memoryListItemSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        userId: "00000000-0000-4000-8000-000000000001",
        email: "user@fairy.local",
        kind: "preference",
        content: "喜欢科幻片",
        sessionId: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-uuid userId or missing email", () => {
    expect(
      memoryListItemSchema.safeParse({
        id: "x",
        userId: "not-a-uuid",
        email: "user@fairy.local",
        kind: "preference",
        content: "喜欢科幻片",
        sessionId: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      memoryListItemSchema.safeParse({
        id: "x",
        userId: "00000000-0000-4000-8000-000000000001",
        kind: "preference",
        content: "喜欢科幻片",
        sessionId: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("memoryListFeedSchema", () => {
  it("accepts an empty feed with pagination", () => {
    expect(
      memoryListFeedSchema.safeParse({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }).success,
    ).toBe(true);
  });
});

describe("memoryCreateSchema", () => {
  it("accepts a valid create body", () => {
    expect(
      memoryCreateSchema.safeParse({
        userId: "00000000-0000-4000-8000-000000000001",
        kind: "fact",
        content: "家住上海",
        sessionId: "550e8400-e29b-41d4-a716-446655440001",
      }).success,
    ).toBe(true);
  });

  it("accepts a create body without sessionId", () => {
    expect(
      memoryCreateSchema.safeParse({
        userId: "00000000-0000-4000-8000-000000000001",
        kind: "fact",
        content: "家住上海",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid kind, empty content, or non-uuid userId", () => {
    expect(
      memoryCreateSchema.safeParse({
        userId: "00000000-0000-4000-8000-000000000001",
        kind: "wish",
        content: "x",
      }).success,
    ).toBe(false);
    expect(
      memoryCreateSchema.safeParse({
        userId: "00000000-0000-4000-8000-000000000001",
        kind: "fact",
        content: "",
      }).success,
    ).toBe(false);
    expect(
      memoryCreateSchema.safeParse({
        userId: "not-a-uuid",
        kind: "fact",
        content: "x",
      }).success,
    ).toBe(false);
  });
});

describe("memoryUpdateSchema", () => {
  it("accepts kind and/or content", () => {
    expect(memoryUpdateSchema.safeParse({ kind: "intent" }).success).toBe(true);
    expect(memoryUpdateSchema.safeParse({ content: "新内容" }).success).toBe(true);
    expect(
      memoryUpdateSchema.safeParse({ kind: "fact", content: "新内容" }).success,
    ).toBe(true);
  });

  it("rejects an empty body or empty content", () => {
    expect(memoryUpdateSchema.safeParse({}).success).toBe(false);
    expect(memoryUpdateSchema.safeParse({ content: "" }).success).toBe(false);
  });
});

describe("memorySelfQuerySchema", () => {
  it("coerces numeric defaults and accepts kind/keyword filters", () => {
    const parsed = memorySelfQuerySchema.safeParse({
      page: "2",
      limit: "50",
      kind: "fact",
      keyword: " 上海 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(50);
      expect(parsed.data.keyword).toBe("上海");
    }
  });

  it("strips unknown userId/email parameters (identity comes from the token)", () => {
    const parsed = memorySelfQuerySchema.safeParse({
      page: "1",
      userId: "00000000-0000-4000-8000-000000000099",
      email: "other@fairy.local",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("userId");
      expect(parsed.data).not.toHaveProperty("email");
    }
  });

  it("defaults page/limit and rejects invalid kind or out-of-range limit", () => {
    const parsed = memorySelfQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.limit).toBe(20);
    }
    expect(memorySelfQuerySchema.safeParse({ kind: "wish" }).success).toBe(false);
    expect(memorySelfQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(memorySelfQuerySchema.safeParse({ limit: "200" }).success).toBe(false);
  });
});

describe("memorySelfListItemSchema", () => {
  it("accepts a self list item without email/userId", () => {
    expect(
      memorySelfListItemSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        kind: "preference",
        content: "喜欢科幻片",
        sessionId: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      memorySelfListItemSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        kind: "preference",
        content: "喜欢科幻片",
        sessionId: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("strips email/userId from a self list item and requires content", () => {
    const parsed = memorySelfListItemSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      userId: "00000000-0000-4000-8000-000000000001",
      email: "user@fairy.local",
      kind: "preference",
      content: "喜欢科幻片",
      sessionId: null,
      createdAt: "2026-09-01T10:00:00Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("userId");
      expect(parsed.data).not.toHaveProperty("email");
    }
    expect(
      memorySelfListItemSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        kind: "preference",
        content: "",
        sessionId: null,
        createdAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("memorySelfListFeedSchema", () => {
  it("accepts an empty self feed with pagination", () => {
    expect(
      memorySelfListFeedSchema.safeParse({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }).success,
    ).toBe(true);
  });
});


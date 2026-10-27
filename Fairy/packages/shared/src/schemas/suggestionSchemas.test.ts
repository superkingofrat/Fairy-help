import { describe, expect, it } from "vitest";
import {
  suggestionSchema,
  suggestionListFeedSchema,
  suggestionListQuerySchema,
  suggestionKindSchema,
  unreadCountSchema,
} from "./suggestionSchemas.js";

const suggestionFixture = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  kind: "LOW_STOCK",
  summary: "《教父》库存告急",
  body: "目前仅剩 1 盒在库，建议尽快补货。",
  sourceData: {
    movieId: "550e8400-e29b-41d4-a716-446655440001",
    title: "教父",
    stock: 1,
    totalStock: 3,
  },
  readAt: null,
  createdAt: "2026-09-23T09:00:00.000Z",
};

describe("suggestionKindSchema", () => {
  it("accepts all four kinds and rejects others", () => {
    for (const kind of ["LOW_STOCK", "BORROW_RATIO", "DORMANT", "DAILY_REPORT"]) {
      expect(suggestionKindSchema.safeParse(kind).success).toBe(true);
    }
    expect(suggestionKindSchema.safeParse("WEATHER").success).toBe(false);
  });
});

describe("suggestionSchema", () => {
  it("accepts an unread suggestion with source data", () => {
    expect(suggestionSchema.safeParse(suggestionFixture).success).toBe(true);
  });

  it("accepts a read suggestion with a read timestamp", () => {
    expect(
      suggestionSchema.safeParse({ ...suggestionFixture, readAt: "2026-09-23T10:00:00.000Z" })
        .success,
    ).toBe(true);
  });

  it("rejects missing summary/body and unknown kind", () => {
    const withoutSummary = { ...suggestionFixture };
    delete (withoutSummary as Partial<typeof suggestionFixture>).summary;
    expect(suggestionSchema.safeParse(withoutSummary).success).toBe(false);
    const withoutBody = { ...suggestionFixture };
    delete (withoutBody as Partial<typeof suggestionFixture>).body;
    expect(suggestionSchema.safeParse(withoutBody).success).toBe(false);
    expect(suggestionSchema.safeParse({ ...suggestionFixture, kind: "TREND" }).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const parsed = suggestionSchema.safeParse({ ...suggestionFixture, dedupeKey: "LOW_STOCK:x" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("dedupeKey");
  });
});

describe("suggestionListFeedSchema", () => {
  it("accepts items plus pagination and requires non-negative totals", () => {
    const feed = {
      items: [suggestionFixture],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    expect(suggestionListFeedSchema.safeParse(feed).success).toBe(true);
    expect(
      suggestionListFeedSchema.safeParse({
        items: [],
        pagination: { page: 1, limit: 20, total: -1, totalPages: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("suggestionListQuerySchema", () => {
  it("defaults page/limit and coerces strings", () => {
    const parsed = suggestionListQuerySchema.safeParse({ page: "2", limit: "5" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ page: 2, limit: 5 });
  });

  it("rejects out-of-range pagination", () => {
    expect(suggestionListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(suggestionListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("unreadCountSchema", () => {
  it("accepts a non-negative count", () => {
    expect(unreadCountSchema.safeParse({ count: 0 }).success).toBe(true);
    expect(unreadCountSchema.safeParse({ count: 7 }).success).toBe(true);
    expect(unreadCountSchema.safeParse({ count: -1 }).success).toBe(false);
  });
});

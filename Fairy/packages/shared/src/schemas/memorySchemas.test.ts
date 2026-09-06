import { describe, expect, it } from "vitest";
import {
  memoryKindSchema,
  memoryRecordSchema,
  memoryExtractionSchema,
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

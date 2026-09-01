import { describe, expect, it } from "vitest";
import {
  chatEventSchema,
  chatMessageDtoSchema,
  chatMessagePayloadSchema,
  sessionIdParamSchema,
  sessionListItemSchema,
  sessionRoleSchema,
} from "./sessionSchemas";

const movieDto = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "星际穿越",
  director: "Christopher Nolan",
  year: 2014,
  mood: ["治愈"],
  scene: ["雨天"],
  genres: ["科幻"],
  quote: null,
  stock: 3,
  totalStock: 5,
  coverUrl: null,
  description: "测试",
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

describe("sessionRoleSchema", () => {
  it("accepts user and assistant", () => {
    expect(sessionRoleSchema.safeParse("user").success).toBe(true);
    expect(sessionRoleSchema.safeParse("assistant").success).toBe(true);
  });

  it("rejects other roles", () => {
    expect(sessionRoleSchema.safeParse("system").success).toBe(false);
  });
});

describe("chatEventSchema", () => {
  it("accepts a recommendation event with movie items", () => {
    const result = chatEventSchema.safeParse({
      type: "recommendation",
      items: [movieDto],
    });
    expect(result.success).toBe(true);
  });

  it("accepts borrow and return events", () => {
    for (const type of ["borrow", "return"]) {
      const result = chatEventSchema.safeParse({
        type,
        success: true,
        remainingStock: 2,
        rentalId: "880e8400-e29b-41d4-a716-446655440000",
        code: "OK",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown event type", () => {
    const result = chatEventSchema.safeParse({ type: "error" });
    expect(result.success).toBe(false);
  });
});

describe("chatMessagePayloadSchema", () => {
  it("accepts an events array", () => {
    const result = chatMessagePayloadSchema.safeParse({ events: [] });
    expect(result.success).toBe(true);
  });
});

describe("chatMessageDtoSchema", () => {
  it("accepts a full dto with a nullable payload", () => {
    const result = chatMessageDtoSchema.safeParse({
      id: "770e8400-e29b-41d4-a716-446655440000",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      role: "assistant",
      content: "找到了",
      payload: {
        events: [{ type: "recommendation", items: [movieDto] }],
      },
      createdAt: "2026-09-01T09:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a null payload", () => {
    const result = chatMessageDtoSchema.safeParse({
      id: "770e8400-e29b-41d4-a716-446655440000",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      role: "user",
      content: "雨天",
      payload: null,
      createdAt: "2026-09-01T09:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    const result = chatMessageDtoSchema.safeParse({
      id: "not-a-uuid",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      role: "user",
      content: "雨天",
      payload: null,
      createdAt: "2026-09-01T09:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("sessionListItemSchema", () => {
  it("accepts a list item", () => {
    const result = sessionListItemSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "雨天",
      messageCount: 3,
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T09:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative message count", () => {
    const result = sessionListItemSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "雨天",
      messageCount: -1,
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T09:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("sessionIdParamSchema", () => {
  it("requires a uuid id", () => {
    expect(sessionIdParamSchema.safeParse({ id: movieDto.id }).success).toBe(true);
    expect(sessionIdParamSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});

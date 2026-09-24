import { describe, expect, it } from "vitest";
import { chatRequestSchema } from "./chatSchemas";

describe("chatRequestSchema", () => {
  it("accepts a message only", () => {
    const result = chatRequestSchema.safeParse({ message: "雨天心情不好" });
    expect(result.success).toBe(true);
  });

  it("accepts empty message with movieId", () => {
    const result = chatRequestSchema.safeParse({
      message: "",
      movieId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid movieId", () => {
    const result = chatRequestSchema.safeParse({ message: "", movieId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts action return with movieId", () => {
    const result = chatRequestSchema.safeParse({
      message: "",
      movieId: "550e8400-e29b-41d4-a716-446655440000",
      action: "return",
    });
    expect(result.success).toBe(true);
  });

  it("rejects action return without movieId", () => {
    const result = chatRequestSchema.safeParse({ message: "", action: "return" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown action value", () => {
    const result = chatRequestSchema.safeParse({
      message: "",
      movieId: "550e8400-e29b-41d4-a716-446655440000",
      action: "borrow",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional sessionId", () => {
    const result = chatRequestSchema.safeParse({
      message: "雨天",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts sessionId together with action return", () => {
    const result = chatRequestSchema.safeParse({
      message: "",
      movieId: "550e8400-e29b-41d4-a716-446655440000",
      action: "return",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank sessionId", () => {
    const result = chatRequestSchema.safeParse({ message: "雨天", sessionId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid sessionId", () => {
    // 会话 id 是 Prisma uuid()：非 UUID 会穿透到查询变 500，而契约承诺 404/403
    const result = chatRequestSchema.safeParse({ message: "雨天", sessionId: "session-1" });
    expect(result.success).toBe(false);
  });

  it("rejects a message longer than the input cap", () => {
    // 与 llmClient.MAX_INPUT_CHARS 对齐：超长消息此前被静默截断
    const result = chatRequestSchema.safeParse({ message: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("accepts a message at the input cap", () => {
    const result = chatRequestSchema.safeParse({ message: "a".repeat(2000) });
    expect(result.success).toBe(true);
  });
});

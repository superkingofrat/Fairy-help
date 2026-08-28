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
});

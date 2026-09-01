import { describe, expect, it } from "vitest";
import { plan } from "../agent/planner";
import type { ChatIntent } from "../agent/intentClassifier";

describe("plan", () => {
  it("maps store_insight intent to the insight tool with its topic", () => {
    const intent: ChatIntent = { type: "store_insight", topic: "inventory" };
    expect(plan(intent)).toEqual({ tool: "insight", topic: "inventory" });
  });

  it("keeps existing intent mappings intact", () => {
    expect(
      plan({ type: "borrow", movieId: "550e8400-e29b-41d4-a716-446655440000" })
    ).toEqual({ tool: "borrow", movieId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(plan({ type: "chitchat" })).toEqual({ tool: "none", reason: "chitchat" });
    expect(plan({ type: "unmatched" })).toEqual({ tool: "none", reason: "unmatched" });
  });
});

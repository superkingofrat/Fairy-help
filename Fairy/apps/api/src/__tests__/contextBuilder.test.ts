import { describe, expect, it } from "vitest";
import { buildConversationHistory, type HistoryTurn } from "../agent/contextBuilder";

describe("buildConversationHistory", () => {
  it("returns an empty string for an empty history", () => {
    expect(buildConversationHistory([])).toBe("");
  });

  it("formats turns as 用户/Fairy lines in chronological order", () => {
    const turns: HistoryTurn[] = [
      { role: "user", content: "雨天想看点什么" },
      { role: "assistant", content: "为你推荐《星际穿越》" },
    ];

    expect(buildConversationHistory(turns)).toBe(
      "用户：雨天想看点什么\nFairy：为你推荐《星际穿越》"
    );
  });
});

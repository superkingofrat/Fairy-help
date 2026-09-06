import { describe, expect, it } from "vitest";
import {
  buildConversationHistory,
  buildMemoryBlock,
  type HistoryTurn,
} from "../agent/contextBuilder";

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

describe("buildMemoryBlock", () => {
  it("returns an empty string for no memories", () => {
    expect(buildMemoryBlock([])).toBe("");
  });

  it("formats memories as a 【记忆】 block with kind tags", () => {
    const memories = [
      {
        id: "m1",
        profileId: "p1",
        sessionId: null,
        kind: "preference" as const,
        content: "喜欢科幻片",
        metadata: null,
        createdAt: "2026-09-01T10:00:00Z",
      },
      {
        id: "m2",
        profileId: "p1",
        sessionId: null,
        kind: "fact" as const,
        content: "家住上海",
        metadata: null,
        createdAt: "2026-09-01T09:00:00Z",
      },
    ];

    expect(buildMemoryBlock(memories)).toBe(
      "【记忆】\n- [preference] 喜欢科幻片\n- [fact] 家住上海"
    );
  });
});

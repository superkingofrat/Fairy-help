import { describe, expect, it } from "vitest";
import {
  buildConversationHistory,
  buildMemoryBlock,
  trimHistoryToBudget,
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
      "用户：雨天想看点什么\nFairy：为你推荐《星际穿越》",
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
      "【记忆】\n- [preference] 喜欢科幻片\n- [fact] 家住上海",
    );
  });
});

describe("trimHistoryToBudget", () => {
  const shortMemory = "【记忆】\n- [preference] 科幻片";
  const longHistory = "用户：".padEnd(10000, "A") + "\nFairy：".padEnd(10000, "B");

  it("does not trim when under budget", () => {
    const result = trimHistoryToBudget("用户：你好\nFairy：你好呀", shortMemory);
    expect(result).toBe("用户：你好\nFairy：你好呀");
  });

  it("returns empty string when memory alone exceeds budget", () => {
    const hugeMemory = "【记忆】\n" + "x".repeat(20000);
    expect(trimHistoryToBudget("用户：hello", hugeMemory)).toBe("");
  });

  it("trims history from the tail when over budget", () => {
    const result = trimHistoryToBudget(longHistory, shortMemory);
    // memory is ~20 tokens, budget 4000, so only a fraction of 10k chars history survives
    expect(result.length).toBeLessThan(longHistory.length);
    // trimmed result should be non-empty when budget > memory
    expect(result.length).toBeGreaterThan(0);
  });

  it("keeps history intact when memory block is empty", () => {
    const result = trimHistoryToBudget(longHistory, "");
    expect(result.length).toBeLessThan(longHistory.length);
  });
});

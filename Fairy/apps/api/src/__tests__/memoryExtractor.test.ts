import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatResult } from "@fairy/ai-sdk";
import { extractMemories, extractAndStoreMemories } from "../memory/memoryExtractor";
import * as llmClient from "../agent/llmClient";
import * as memoryService from "../memory/memoryService";

vi.mock("../agent/llmClient", () => ({
  sanitizeUserInput: (message: string) => message.trim(),
  tryChat: vi.fn(),
}));
vi.mock("../memory/memoryService", () => ({
  addMemory: vi.fn(),
}));

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";

function llmResult(text: string): ChatResult {
  return {
    text,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: "test-model",
    provider: "deepseek",
  };
}

describe("memoryExtractor.extractMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a valid extraction from the LLM", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult(
        JSON.stringify({
          memories: [
            { kind: "preference", content: "喜欢科幻片" },
            { kind: "intent", content: "想周末去杭州玩" },
          ],
        })
      )
    );

    const memories = await extractMemories("我喜欢科幻片", "好的，记下了～");

    expect(memories).toEqual([
      { kind: "preference", content: "喜欢科幻片" },
      { kind: "intent", content: "想周末去杭州玩" },
    ]);
    expect(llmClient.tryChat).toHaveBeenCalledWith(
      "agent.memory",
      expect.any(Array),
      expect.objectContaining({ temperature: 0.2 })
    );
  });

  it("returns empty when the LLM emits invalid JSON", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult("好的，没问题！"));

    const memories = await extractMemories("我喜欢科幻片", "好的");

    expect(memories).toEqual([]);
  });

  it("returns empty when the LLM call fails or is unavailable", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const memories = await extractMemories("我喜欢科幻片", "好的");

    expect(memories).toEqual([]);
  });

  it("returns empty for an empty user message", async () => {
    const memories = await extractMemories("   ", "好的");

    expect(memories).toEqual([]);
    expect(llmClient.tryChat).not.toHaveBeenCalled();
  });
});

describe("memoryExtractor.extractAndStoreMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores each extracted memory under the profile", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult(
        JSON.stringify({
          memories: [
            { kind: "preference", content: "喜欢科幻片" },
            { kind: "fact", content: "家住上海" },
          ],
        })
      )
    );
    vi.mocked(memoryService.addMemory).mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      profileId: PROFILE_ID,
      sessionId: "sess-1",
      kind: "preference",
      content: "喜欢科幻片",
      metadata: null,
      createdAt: "2026-09-01T10:00:00Z",
    });

    await extractAndStoreMemories({
      profileId: PROFILE_ID,
      sessionId: "sess-1",
      userMessage: "我喜欢科幻片",
      replyText: "好的",
    });

    expect(memoryService.addMemory).toHaveBeenCalledTimes(2);
    expect(memoryService.addMemory).toHaveBeenCalledWith({
      profileId: PROFILE_ID,
      sessionId: "sess-1",
      kind: "preference",
      content: "喜欢科幻片",
    });
    expect(memoryService.addMemory).toHaveBeenCalledWith({
      profileId: PROFILE_ID,
      sessionId: "sess-1",
      kind: "fact",
      content: "家住上海",
    });
  });

  it("skips storage silently when extraction fails", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    await expect(
      extractAndStoreMemories({
        profileId: PROFILE_ID,
        userMessage: "我喜欢科幻片",
        replyText: "好的",
      })
    ).resolves.toBeUndefined();

    expect(memoryService.addMemory).not.toHaveBeenCalled();
  });

  it("swallows a database write failure", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult(JSON.stringify({ memories: [{ kind: "fact", content: "家住上海" }] }))
    );
    vi.mocked(memoryService.addMemory).mockRejectedValue(new Error("db down"));

    await expect(
      extractAndStoreMemories({
        profileId: PROFILE_ID,
        userMessage: "我家在上海",
        replyText: "好的",
      })
    ).resolves.toBeUndefined();
  });
});

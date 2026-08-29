import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyIntent } from "../agent/intentClassifier";
import * as llmClient from "../agent/llmClient";
import * as movieService from "../services/movieService";
import type { ChatResult } from "@fairy/ai-sdk";

vi.mock("../agent/llmClient", () => ({
  sanitizeUserInput: (message: string) => message,
  tryChat: vi.fn(),
}));
vi.mock("../services/movieService");

const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";

function llmResult(text: string): ChatResult {
  return {
    text,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: "test-model",
    provider: "deepseek",
  };
}

describe("classifyIntent with LLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(movieService.listMoviesForTitleMatch).mockResolvedValue([
      { id: MOVIE_ID, title: "千与千寻" },
    ]);
  });

  it("returns borrow for a valid movieId without calling the LLM", async () => {
    const intent = await classifyIntent({ message: "", movieId: MOVIE_ID });

    expect(intent).toEqual({ type: "borrow", movieId: MOVIE_ID });
    expect(llmClient.tryChat).not.toHaveBeenCalled();
  });

  it("maps non-enum phrasing onto mood/scene enums via the LLM", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult('{"intent":"recommend","moods":["致郁"],"scenes":["失眠夜"]}')
    );

    const intent = await classifyIntent({ message: "今晚有点 emo，想哭一场，睡不着" });

    expect(intent).toEqual({
      type: "recommend",
      moods: ["致郁"],
      scenes: ["失眠夜"],
    });
  });

  it("classifies chitchat without tool dispatch", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult('{"intent":"chitchat","movieTitle":null,"moods":[],"scenes":[]}')
    );

    const intent = await classifyIntent({ message: "你好呀" });

    expect(intent).toEqual({ type: "chitchat" });
  });

  it("resolves a borrow intent by title through title match", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult('{"intent":"borrow","movieTitle":"千与千寻"}')
    );

    const intent = await classifyIntent({ message: "帮我借千与千寻" });

    expect(intent).toEqual({ type: "borrow", movieId: MOVIE_ID });
  });

  it("classifies an LLM return intent by title", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult('{"intent":"return","movieTitle":"千与千寻"}')
    );

    const intent = await classifyIntent({ message: "我要把千与千寻还了" });

    expect(intent).toEqual({ type: "return", movieId: MOVIE_ID });
  });

  it("returns return_unresolved when the LLM return title matches nothing", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult('{"intent":"return","movieTitle":"不存在的片"}')
    );

    const intent = await classifyIntent({ message: "还不存在的片" });

    expect(intent).toEqual({ type: "return_unresolved" });
  });

  it("returns borrow_unresolved when the LLM title matches nothing unique", async () => {
    vi.mocked(movieService.listMoviesForTitleMatch).mockResolvedValue([
      { id: MOVIE_ID, title: "星际穿越" },
      { id: "660e8400-e29b-41d4-a716-446655440000", title: "星际穿越2" },
    ]);
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult('{"intent":"borrow","movieTitle":"星际"}')
    );

    const intent = await classifyIntent({ message: "借星际" });

    expect(intent).toEqual({ type: "borrow_unresolved" });
  });

  it("falls back to rules when no LLM provider is available", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const recommend = await classifyIntent({ message: "雨天" });
    expect(recommend).toEqual({ type: "recommend", moods: [], scenes: ["雨天"] });

    const borrow = await classifyIntent({ message: "借千与千寻" });
    expect(borrow).toEqual({ type: "borrow", movieId: MOVIE_ID });

    const returnIntent = await classifyIntent({ message: "还千与千寻" });
    expect(returnIntent).toEqual({ type: "return", movieId: MOVIE_ID });

    const unmatched = await classifyIntent({ message: "今天星期几" });
    expect(unmatched).toEqual({ type: "unmatched" });
  });

  it("does not misfire return on the homograph 还 (still)", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const intent = await classifyIntent({ message: "还可以" });

    expect(intent).toEqual({ type: "unmatched" });
    expect(llmClient.tryChat).toHaveBeenCalled();
  });

  it("falls back to rules on schema-invalid LLM output", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult("我觉得不太确定，抱歉"));

    const intent = await classifyIntent({ message: "雨天" });

    expect(intent).toEqual({ type: "recommend", moods: [], scenes: ["雨天"] });
  });

  it("falls back to rules when the LLM returns no valid enums", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult('{"intent":"recommend","moods":["失落感"],"scenes":[]}')
    );

    const intent = await classifyIntent({ message: "今天星期几" });

    expect(intent).toEqual({ type: "unmatched" });
  });
});

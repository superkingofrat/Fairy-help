import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, Profile } from "@fairy/shared";
import type { ChatResult } from "@fairy/ai-sdk";
import { synthesize } from "../agent/responseSynthesizer";
import * as llmClient from "../agent/llmClient";

vi.mock("../agent/llmClient", () => ({
  sanitizeUserInput: (message: string) => message,
  tryChat: vi.fn(),
}));

const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";

const sampleMovie: Movie = {
  id: MOVIE_ID,
  title: "星际穿越",
  director: "Christopher Nolan",
  year: 2014,
  mood: ["治愈", "悬疑"],
  scene: ["雨天", "失眠夜"],
  genres: ["科幻"],
  quote: null,
  stock: 3,
  totalStock: 5,
  coverUrl: null,
  description: "",
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

const profile: Profile = {
  userId: "00000000-0000-4000-8000-000000000001",
  name: "铃",
  avatarUrl: null,
  styleTags: [],
  likeGenres: ["科幻"],
  avoidFood: [],
  dietPreference: null,
  travelStyle: null,
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

const context = { message: "雨天", profile };

function llmResult(text: string): ChatResult {
  return {
    text,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: "test-model",
    provider: "deepseek",
  };
}

describe("synthesize with LLM reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the LLM text and keeps the recommendation payload intact", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult("雨天配《星际穿越》刚刚好，点卡片就能借。"));

    const result = await synthesize(
      { kind: "recommend", movies: [sampleMovie] },
      context
    );

    expect(result.texts[0].content).toBe("雨天配《星际穿越》刚刚好，点卡片就能借。");
    expect(result.recommendation?.items).toEqual([sampleMovie]);
    expect(llmClient.tryChat).toHaveBeenCalledWith(
      "agent.reply",
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("喜欢的类型 科幻"),
        }),
      ]),
      expect.anything()
    );
  });

  it("falls back to the Phase 2 template when the LLM is unavailable", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await synthesize({ kind: "recommend", movies: [sampleMovie] }, context);

    expect(result.texts[0].content).toBe("为你找到这些可借的片子：《星际穿越》。点卡片就能借阅。");
    expect(result.recommendation?.items).toEqual([sampleMovie]);
  });

  it("falls back to the template for empty recommend results", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await synthesize({ kind: "recommend", movies: [] }, context);

    expect(result.texts[0].content).toBe("这会儿没有符合心情和场景、又有库存的片子。换个标签再试试？");
    expect(result.recommendation).toBeUndefined();
  });

  it("replies naturally to chitchat without business facts", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult("你好呀，今天想看点什么？"));

    const result = await synthesize({ kind: "none", reason: "chitchat" }, context);

    expect(result.texts[0].content).toBe("你好呀，今天想看点什么？");
    expect(result.recommendation).toBeUndefined();
    expect(result.borrow).toBeUndefined();
  });

  it("uses the LLM for borrow success and keeps the borrow payload", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult("借好了，这部还剩 2 盘。"));

    const result = await synthesize(
      { kind: "borrow", success: true, remainingStock: 2, rentalId: "r1", code: "OK" },
      context
    );

    expect(result.texts[0].content).toBe("借好了，这部还剩 2 盘。");
    expect(result.borrow).toEqual({
      success: true,
      remainingStock: 2,
      rentalId: "r1",
      code: "OK",
    });
  });

  it("falls back to the failure template for OUT_OF_STOCK", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await synthesize(
      { kind: "borrow", success: false, remainingStock: null, rentalId: null, code: "OUT_OF_STOCK" },
      context
    );

    expect(result.texts[0].content).toBe("该影片暂时缺货。");
    expect(result.borrow).toMatchObject({ success: false, code: "OUT_OF_STOCK" });
  });

  it("falls back to the guiding template for borrow_unresolved", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await synthesize({ kind: "none", reason: "borrow_unresolved" }, context);

    expect(result.texts[0].content).toBe("没能确定要借哪一部。可以说完整片名，或点推荐卡片上的借阅按钮。");
  });

  it("falls back to the template when the LLM text is blank", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult("   "));

    const result = await synthesize({ kind: "none", reason: "unmatched" }, context);

    expect(result.texts[0].content).toBe("可以说一个心情或场景，比如「雨天」或「治愈」，也可以点卡片借阅。");
  });
});

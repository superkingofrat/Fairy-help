import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import type { ChatResult } from "@fairy/ai-sdk";
import { planTripTool } from "../tools/planTripTool";
import * as llmClient from "../agent/llmClient";
import * as profileService from "../services/profileService";
import type { CompanionCandidate } from "../services/profileService";
import * as amapClient from "../services/amapClient";

vi.mock("../agent/llmClient", () => ({
  sanitizeUserInput: (message: string) => message,
  tryChat: vi.fn(),
}));
vi.mock("../services/profileService");
vi.mock("../services/amapClient");
// behaviorLogService 不 mock：经真实 appendQuietly → append → prisma.behaviorLog.create
// 走完整链路，「日志写失败仍 success」才测得的是生产行为而非 mock 行为
vi.mock("@fairy/database", () => ({
  prisma: {
    trip: {
      create: vi.fn(),
    },
    behaviorLog: {
      create: vi.fn(),
    },
  },
}));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const TRIP_ID = "550e8400-e29b-41d4-a716-446655440000";

function llmResult(text: string): ChatResult {
  return {
    text,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: "test-model",
    provider: "deepseek",
  };
}

const draftJson = JSON.stringify({
  destination: "杭州",
  itinerary: [
    {
      day: 1,
      title: "西湖经典一日",
      steps: [
        { time: "09:00", poi: "西湖", category: "景点", note: "环湖散步" },
        { time: "15:00", poi: "河坊街", category: "美食", note: null },
      ],
    },
  ],
});

const COMPANION_USER_ID = "00000000-0000-4000-8000-0000000000c1";

function companionCandidate(
  name: string,
  overrides: Partial<CompanionCandidate> = {},
): CompanionCandidate {
  return {
    userId: COMPANION_USER_ID,
    name,
    travelStyle: null,
    styleTags: [],
    dietPreference: null,
    avoidFood: [],
    ...overrides,
  };
}

// 取首次 tryChat 调用中发给模型的 user 消息（行程提示词注入的载体）
function draftedPrompt(): string {
  const messages = vi.mocked(llmClient.tryChat).mock.calls[0][1];
  return messages[messages.length - 1].content;
}

const LYCAON = companionCandidate("莱卡恩", {
  travelStyle: "服务型行程，先订三套备选方案",
  styleTags: ["优雅", "洁癖", "全能"],
  dietPreference: "料理标准极高，餐具必须对齐",
  avoidFood: [],
});

function profileWith(travelStyle: string | null) {
  return {
    userId: USER_ID,
    name: "铃",
    avatarUrl: null,
    styleTags: [],
    likeGenres: [],
    avoidFood: [],
    dietPreference: null,
    travelStyle,
    createdAt: "2024-01-15T10:20:00Z",
    updatedAt: "2024-08-05T18:45:00Z",
  };
}

describe("planTripTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profileService.getByUserId).mockResolvedValue(profileWith("自由行，喜欢美食"));
    vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([]);
    vi.mocked(prisma.trip.create).mockResolvedValue({
      id: TRIP_ID,
      userId: USER_ID,
      destination: "杭州",
      days: 1,
      itinerary: {},
      route: null,
      status: "DRAFT",
      companionName: null,
      companionUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("persists a validated trip with Amap locations and route legs", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
    vi.mocked(amapClient.searchPoi)
      .mockResolvedValueOnce({
        name: "西湖",
        location: { lng: 120.15, lat: 30.25 },
        adcode: "330106",
        category: "风景名胜",
      })
      .mockResolvedValueOnce({
        name: "河坊街",
        location: { lng: 120.17, lat: 30.24 },
        adcode: "330102",
        category: "美食",
      });
    vi.mocked(amapClient.planRoute).mockResolvedValue({
      distanceMeters: 2100,
      durationSeconds: 480,
    });

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    expect(result.success).toBe(true);
    if (!result.success || "unresolved" in result.data) {
      throw new Error("expected a trip result");
    }
    expect(result.data).toMatchObject({
      tripId: TRIP_ID,
      destination: "杭州",
      days: 1,
      validated: true,
    });
    expect(result.data.itinerary[0].steps[0]).toMatchObject({
      name: "西湖",
      validated: true,
      location: { lng: 120.15, lat: 30.25 },
    });
    expect(result.data.route).toEqual([
      {
        from: "西湖",
        to: "河坊街",
        distanceMeters: 2100,
        durationSeconds: 480,
      },
    ]);

    expect(prisma.trip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        destination: "杭州",
        days: 1,
      }),
    });
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: "TRIP_PLANNED",
        payload: {
          destination: "杭州",
          days: 1,
          tripId: TRIP_ID,
          validated: true,
        },
      },
    });
    expect(amapClient.searchPoi).toHaveBeenCalledWith("西湖", "杭州");
  });

  it("still returns the trip when the TRIP_PLANNED log write throws", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
    vi.mocked(amapClient.searchPoi).mockResolvedValue(null);
    vi.mocked(amapClient.planRoute).mockResolvedValue(null);
    vi.mocked(prisma.behaviorLog.create).mockRejectedValue(new Error("db down"));

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    // 行程已落库：日志失败只应损失可观测性，不能把既成事实翻成失败
    expect(result.success).toBe(true);
    if (!result.success || "unresolved" in result.data) {
      throw new Error("expected a trip result");
    }
    expect(result.data.tripId).toBe(TRIP_ID);
    expect(prisma.trip.create).toHaveBeenCalled();
  });

  it("degrades to an unvalidated itinerary when Amap is unavailable", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
    vi.mocked(amapClient.searchPoi).mockResolvedValue(null);
    vi.mocked(amapClient.planRoute).mockResolvedValue(null);

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    expect(result.success).toBe(true);
    if (!result.success || "unresolved" in result.data) {
      throw new Error("expected a trip result");
    }
    expect(result.data.validated).toBe(false);
    expect(result.data.route).toBeNull();
    expect(result.data.itinerary[0].steps[0]).toMatchObject({
      name: "西湖",
      validated: false,
      location: null,
    });
    expect(prisma.trip.create).toHaveBeenCalledTimes(1);
  });

  it("returns unresolved without persisting when the destination is missing", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(
      llmResult(
        JSON.stringify({
          destination: null,
          itinerary: [
            { day: 1, title: "x", steps: [{ time: "09:00", poi: "西湖", category: "景点" }] },
          ],
        }),
      ),
    );

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划个行程" });

    expect(result).toEqual({ success: true, data: { unresolved: true } });
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: "TRIP_UNRESOLVED",
        payload: expect.objectContaining({ reason: "draft_destination_null" }),
      },
    });
  });

  it("returns TRIP_DRAFT_FAILED when the LLM draft fails or is invalid", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    expect(result).toEqual({ success: false, error: "TRIP_DRAFT_FAILED" });
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: "TRIP_DRAFT_FAILED",
        payload: expect.objectContaining({ reason: "llm_draft_failed" }),
      },
    });
  });

  it("retries the draft once before giving up on invalid JSON", async () => {
    vi.mocked(llmClient.tryChat)
      .mockResolvedValueOnce(llmResult("抱歉，我无法生成行程。"))
      .mockResolvedValueOnce(llmResult(draftJson));
    vi.mocked(amapClient.searchPoi).mockResolvedValue(null);
    vi.mocked(amapClient.planRoute).mockResolvedValue(null);

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("unresolved");
    }
    expect(llmClient.tryChat).toHaveBeenCalledTimes(2);
    expect(prisma.trip.create).toHaveBeenCalledTimes(1);
  });

  it("budgets the draft for reasoning plus the itinerary JSON", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));

    await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    // reasoning 模型的思考与正文共用 completion 预算：1200 曾把 2 天行程的 JSON 截断成半句，
    // 3500 仍有一轮连撞两次上限，故锁 4000 这个下限防回归。
    const options = vi.mocked(llmClient.tryChat).mock.calls[0][2];
    expect(options?.maxTokens).toBeGreaterThanOrEqual(4000);
  });

  it("keeps the per-day step guidance in the draft prompt", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));

    await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    const messages = vi.mocked(llmClient.tryChat).mock.calls[0][1];
    const systemPrompt = messages[0].content;
    expect(systemPrompt).toContain("建议 3-5 个");
    // 旧的「3-8 个步骤」规格是正文超长的直接原因，不得回退
    expect(systemPrompt).not.toContain("3-8");
  });

  it("asks the draft to follow the caller's travel style and companion preferences", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));

    await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    const messages = vi.mocked(llmClient.tryChat).mock.calls[0][1];
    const systemPrompt = messages[0].content;
    expect(systemPrompt).toContain("参考用户画像的旅行风格与同行人偏好（如有），让行程贴合风格");
  });

  it("asks for the destination when the LLM draft fails and the message has no destination", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划个行程" });

    expect(result).toEqual({ success: true, data: { unresolved: true } });
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: "TRIP_UNRESOLVED",
        payload: expect.objectContaining({ reason: "draft_failed_no_destination" }),
      },
    });
  });

  it("returns TRIP_DRAFT_FAILED when the LLM draft fails but the message names a destination", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await planTripTool({ userId: USER_ID, message: "安排一趟去杭州的旅行" });

    expect(result).toEqual({ success: false, error: "TRIP_DRAFT_FAILED" });
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: "TRIP_DRAFT_FAILED",
        payload: expect.objectContaining({ reason: "llm_draft_failed" }),
      },
    });
  });

  it("returns TRIP_PERSIST_FAILED when the database write throws", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
    vi.mocked(amapClient.searchPoi).mockResolvedValue(null);
    vi.mocked(prisma.trip.create).mockRejectedValue(new Error("db down"));

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    expect(result).toEqual({ success: false, error: "TRIP_PERSIST_FAILED" });
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: "TRIP_PERSIST_FAILED",
        payload: expect.objectContaining({ reason: "db_write_failed" }),
      },
    });
  });

  describe("FU-20 同行人画像", () => {
    function stubAmapUnavailable(): void {
      vi.mocked(amapClient.searchPoi).mockResolvedValue(null);
      vi.mocked(amapClient.planRoute).mockResolvedValue(null);
    }

    it("injects the matched companion's profile into the draft prompt", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([LYCAON]);

      const result = await planTripTool({
        userId: USER_ID,
        message: "我周末要和莱卡恩出去泉州玩",
      });

      expect(result.success).toBe(true);
      // 本人画像在前、同行人在后，两行都带归属，互不覆盖
      expect(draftedPrompt()).toBe(
        "用户画像旅行风格：自由行，喜欢美食。" +
          "同行人莱卡恩的偏好：旅行风格「服务型行程，先订三套备选方案」；风格标签「优雅、洁癖、全能」；饮食偏好「料理标准极高，餐具必须对齐」。" +
          "用户说：「我周末要和莱卡恩出去泉州玩」",
      );
      // 候选查询排除登录用户本人
      expect(profileService.listCompanionCandidates).toHaveBeenCalledWith(USER_ID);
      expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: "TRIP_PLANNED",
          payload: {
            destination: "杭州",
            days: 1,
            tripId: TRIP_ID,
            validated: false,
            companionName: "莱卡恩",
            companionUserId: COMPANION_USER_ID,
          },
        },
      });
    });

    it("resolves the first-mentioned companion when several names match", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([
        LYCAON,
        companionCandidate("比利", {
          travelStyle: "动作冒险行程",
          styleTags: ["热血"],
        }),
      ]);

      const result = await planTripTool({
        userId: USER_ID,
        message: "我想和比利、莱卡恩一起去泉州玩",
      });

      expect(result.success).toBe(true);
      expect(draftedPrompt()).toContain(
        "同行人比利的偏好：旅行风格「动作冒险行程」；风格标签「热血」。",
      );
      expect(draftedPrompt()).not.toContain("同行人莱卡恩");
    });

    it("plans without companion context when no registered name appears", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([LYCAON]);

      const result = await planTripTool({
        userId: USER_ID,
        message: "我周末要和小明出去泉州玩",
      });

      expect(result.success).toBe(true);
      expect(draftedPrompt()).toBe(
        "用户画像旅行风格：自由行，喜欢美食。用户说：「我周末要和小明出去泉州玩」",
      );
    });

    it("keeps the prompt and log payload unchanged when there are no candidates", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
      stubAmapUnavailable();

      const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

      expect(result.success).toBe(true);
      expect(draftedPrompt()).toBe(
        "用户画像旅行风格：自由行，喜欢美食。用户说：「帮我规划周末去杭州玩」",
      );
      // 未命中同行人时日志负载与改动前逐字一致（不新增 companion 键）
      expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: "TRIP_PLANNED",
          payload: {
            destination: "杭州",
            days: 1,
            tripId: TRIP_ID,
            validated: false,
          },
        },
      });
    });

    it("adds no companion line when the matched profile carries only a name", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([
        companionCandidate("无名氏"),
      ]);

      const result = await planTripTool({
        userId: USER_ID,
        message: "我和无名氏去杭州玩",
      });

      expect(result.success).toBe(true);
      expect(draftedPrompt()).toBe(
        "用户画像旅行风格：自由行，喜欢美食。用户说：「我和无名氏去杭州玩」",
      );
    });

    it("still plans when the companion candidate query fails", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockRejectedValue(new Error("db down"));

      const result = await planTripTool({
        userId: USER_ID,
        message: "我周末要和莱卡恩出去泉州玩",
      });

      expect(result.success).toBe(true);
      expect(draftedPrompt()).not.toContain("同行人");
      expect(llmClient.tryChat).toHaveBeenCalledTimes(1);
    });

    it("skips the companion lookup when the message is empty", async () => {
      const result = await planTripTool({ userId: USER_ID, message: "" });

      expect(result).toEqual({ success: true, data: { unresolved: true } });
      expect(profileService.listCompanionCandidates).not.toHaveBeenCalled();
      expect(llmClient.tryChat).not.toHaveBeenCalled();
    });

    it("carries the matched companion into the result and the Trip row", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([LYCAON]);

      const result = await planTripTool({
        userId: USER_ID,
        message: "我周末要和莱卡恩出去泉州玩",
      });

      expect(result.success).toBe(true);
      if (!result.success || "unresolved" in result.data) {
        throw new Error("expected a trip result");
      }
      // 同行人随结果一起带出，回复/REST/回放才有结构化事实可归属（不重新解析）
      expect(result.data.companion).toEqual({ name: "莱卡恩", userId: COMPANION_USER_ID });
      // 与行程写入同一次 create：不允许「行程在、同行人丢」的中间态
      expect(prisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          companionName: "莱卡恩",
          companionUserId: COMPANION_USER_ID,
        }),
      });
    });

    it("returns companion null and writes no companion columns when no name matches", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([LYCAON]);

      const result = await planTripTool({
        userId: USER_ID,
        message: "我周末要和小明出去泉州玩",
      });

      expect(result.success).toBe(true);
      if (!result.success || "unresolved" in result.data) {
        throw new Error("expected a trip result");
      }
      expect(result.data.companion).toBe(null);
      const createArg = vi.mocked(prisma.trip.create).mock.calls[0][0];
      expect(createArg.data).not.toHaveProperty("companionName");
      expect(createArg.data).not.toHaveProperty("companionUserId");
    });
  });
});

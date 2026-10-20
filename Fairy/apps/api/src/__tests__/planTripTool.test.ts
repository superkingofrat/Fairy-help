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

// FU-21：与 planTripTool.ts 的 REFLECTION_REQUIREMENT 逐字一致。生产文案若被改，这几处
// 注入用例会先红，逼出一次显式决定；「锁文本」本身由下方专用用例对字句断言。
const REFLECTION_REQUIREMENT =
  "落实要求：上面每条偏好都要落到具体选点上，并在对应 step 的 preferenceBasis 里点名是哪条偏好、" +
  "因此选或避开了什么。例如注重洁净/洁癖 → 避开露天摊位、优先可预订或室内餐饮；" +
  "服务型/先订备选方案 → 段与段之间留缓冲、不安排需要赶车的衔接。对应不上的 step 必须填 null。";

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
    // 4000 在 FU-21 实测中也被顶格两次（reasoning 独自吃掉约 3800 token，正文只剩 303 字）。
    // 锁下限防回归——降到 4000 会让行程规划重新变得基本不可用。
    const options = vi.mocked(llmClient.tryChat).mock.calls[0][2];
    expect(options?.maxTokens).toBeGreaterThanOrEqual(5000);
  });

  it("caps the per-day step count and note length in the draft prompt", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));

    await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    const messages = vi.mocked(llmClient.tryChat).mock.calls[0][1];
    const systemPrompt = messages[0].content;
    expect(systemPrompt).toContain("每个 day 3-4 个步骤");
    expect(systemPrompt).toContain("不超过 15 字");
    // 旧的「3-8 个步骤」规格是正文超长的直接原因，不得回退
    expect(systemPrompt).not.toContain("3-8");
  });

  it("makes the companion profile a constraint on the chosen spots, not a note", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));

    await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    const messages = vi.mocked(llmClient.tryChat).mock.calls[0][1];
    const systemPrompt = messages[0].content;
    // 原先写「参考…让行程贴合」，模型只在 note 里承认偏好却不改选点（泉州实测：
    // 「料理标准极高」配两天街头小吃，只在备注里写「已备注餐具对齐」）。
    // 锁住「约束」措辞与「落实在选点、note 只写执行信息」的分工，防回退成软参考。
    expect(systemPrompt).toContain("是约束而非仅供参考");
    expect(systemPrompt).toContain("偏好要落实在选点上");
    expect(systemPrompt).not.toContain("参考用户画像的旅行风格");
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
          REFLECTION_REQUIREMENT +
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

  describe("FU-21 偏好依据", () => {
    function stubAmapUnavailable(): void {
      vi.mocked(amapClient.searchPoi).mockResolvedValue(null);
      vi.mocked(amapClient.planRoute).mockResolvedValue(null);
    }

    // basis 参数故意收 unknown：同一份草稿要能喂合法字符串、null、空串，逐个验证边界
    function draftWith(basis: unknown): string {
      return JSON.stringify({
        destination: "杭州",
        itinerary: [
          {
            day: 1,
            title: "西湖经典一日",
            steps: [
              {
                time: "09:00",
                poi: "西湖",
                category: "景点",
                note: "环湖散步",
                preferenceBasis: basis,
              },
              { time: "15:00", poi: "河坊街", category: "美食", note: null, preferenceBasis: null },
            ],
          },
        ],
      });
    }

    it("carries a non-empty basis into the step and the stored itinerary JSON", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftWith("洁癖 → 避开露天摊位")));
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
      expect(result.data.itinerary[0].steps[0].preferenceBasis).toBe("洁癖 → 避开露天摊位");
      // 键必须一路走到落库的 itinerary（Json 列随 JSON 走，无需迁移）
      const createArg = vi.mocked(prisma.trip.create).mock.calls[0][0];
      expect(createArg.data).toMatchObject({
        itinerary: [
          {
            steps: [
              expect.objectContaining({ preferenceBasis: "洁癖 → 避开露天摊位" }),
              expect.objectContaining({ preferenceBasis: null }),
            ],
          },
        ],
      });
    });

    it("keeps the basis null when the draft cannot tie a step to a preference", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftWith(null)));
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
      // 对应不上就留空：不得为了填字段而编造（AGENTS §0 禁止幻觉内容）
      expect(result.data.itinerary[0].steps[0].preferenceBasis).toBeNull();
      expect(result.data.itinerary[0].steps[1].preferenceBasis).toBeNull();
    });

    it("normalizes a blank basis to null so it cannot bypass the schema's min(1)", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftWith("   ")));
      stubAmapUnavailable();

      const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

      expect(result.success).toBe(true);
      if (!result.success || "unresolved" in result.data) {
        throw new Error("expected a trip result");
      }
      // 空串原样落库会绕过 shared 的 .min(1)，等回放/详情解析时才炸，且已查不出是哪一步
      expect(result.data.itinerary[0].steps[0].preferenceBasis).toBeNull();
    });

    it("adds no reflection requirement and no basis when nothing preference-shaped was injected", async () => {
      vi.mocked(profileService.getByUserId).mockResolvedValue(profileWith(null));
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftWith(null)));
      stubAmapUnavailable();

      const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

      expect(result.success).toBe(true);
      if (!result.success || "unresolved" in result.data) {
        throw new Error("expected a trip result");
      }
      // 无偏好可落实：user 消息与改动前逐字一致（连落实要求都不追加）
      expect(draftedPrompt()).toBe("用户说：「帮我规划周末去杭州玩」");
      expect(result.data.itinerary[0].steps.every((step) => step.preferenceBasis === null)).toBe(
        true,
      );
    });

    it("keeps the user message byte-identical when only the caller's own travel style exists", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftWith("自由行 → 少排赶车段")));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([LYCAON]);

      const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

      expect(result.success).toBe(true);
      // spec 的 MUST：无同行人时 user 消息与偏好注入前逐字一致。落实要求只跟同行人偏好绑定，
      // 不能因为本人有 travelStyle 就破例——那样每个有画像的用户都会拿到一条多出来的指令。
      expect(draftedPrompt()).toBe(
        "用户画像旅行风格：自由行，喜欢美食。用户说：「帮我规划周末去杭州玩」",
      );
      expect(draftedPrompt()).not.toContain("落实要求");
    });

    it("locks the prompt clauses that make the basis mandatory yet forbid filler", async () => {
      vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftWith(null)));
      stubAmapUnavailable();
      vi.mocked(profileService.listCompanionCandidates).mockResolvedValue([LYCAON]);

      await planTripTool({ userId: USER_ID, message: "我周末要和莱卡恩出去泉州玩" });

      const systemPrompt = vi.mocked(llmClient.tryChat).mock.calls[0][1][0].content;
      // 缺一句就退化成「写了字段但没有约束」或「为填而编造」，两句都要锁
      expect(systemPrompt).toContain('"preferenceBasis":string|null');
      expect(systemPrompt).toContain("不超过 20 字");
      expect(systemPrompt).toContain("不得为了填字段而编造依据");
      // note 与依据的分工不能混：note 仍只写执行信息
      expect(systemPrompt).toContain("note 只写时间/预约/排队等执行信息");
      // 落实要求本身进 user 消息，不是只写在 system 里
      expect(draftedPrompt()).toContain("每条偏好都要落到具体选点上");
      expect(draftedPrompt()).toContain("对应不上的 step 必须填 null");
    });
  });
});

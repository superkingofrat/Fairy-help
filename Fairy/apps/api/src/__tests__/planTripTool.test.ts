import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import type { ChatResult } from "@fairy/ai-sdk";
import { planTripTool } from "../tools/planTripTool";
import * as llmClient from "../agent/llmClient";
import * as profileService from "../services/profileService";
import * as behaviorLogService from "../services/behaviorLogService";
import * as amapClient from "../services/amapClient";

vi.mock("../agent/llmClient", () => ({
  sanitizeUserInput: (message: string) => message,
  tryChat: vi.fn(),
}));
vi.mock("../services/profileService");
vi.mock("../services/behaviorLogService");
vi.mock("../services/amapClient");
vi.mock("@fairy/database", () => ({
  prisma: {
    trip: {
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

describe("planTripTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profileService.getByUserId).mockResolvedValue({
      userId: USER_ID,
      name: "铃",
      avatarUrl: null,
      styleTags: [],
      likeGenres: [],
      avoidFood: [],
      dietPreference: null,
      travelStyle: "自由行，喜欢美食",
      createdAt: "2024-01-15T10:20:00Z",
      updatedAt: "2024-08-05T18:45:00Z",
    });
    vi.mocked(prisma.trip.create).mockResolvedValue({
      id: TRIP_ID,
      userId: USER_ID,
      destination: "杭州",
      days: 1,
      itinerary: {},
      route: null,
      status: "DRAFT",
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
    expect(behaviorLogService.append).toHaveBeenCalledWith({
      userId: USER_ID,
      action: "TRIP_PLANNED",
      payload: {
        destination: "杭州",
        days: 1,
        tripId: TRIP_ID,
        validated: true,
      },
    });
    expect(amapClient.searchPoi).toHaveBeenCalledWith("西湖", "杭州");
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
          itinerary: [{ day: 1, title: "x", steps: [{ time: "09:00", poi: "西湖", category: "景点" }] }],
        })
      )
    );

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划个行程" });

    expect(result).toEqual({ success: true, data: { unresolved: true } });
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(behaviorLogService.append).not.toHaveBeenCalled();
  });

  it("returns TRIP_DRAFT_FAILED when the LLM draft fails or is invalid", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    expect(result).toEqual({ success: false, error: "TRIP_DRAFT_FAILED" });
    expect(prisma.trip.create).not.toHaveBeenCalled();
  });

  it("asks for the destination when the LLM draft fails and the message has no destination", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划个行程" });

    expect(result).toEqual({ success: true, data: { unresolved: true } });
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(behaviorLogService.append).not.toHaveBeenCalled();
  });

  it("returns TRIP_DRAFT_FAILED when the LLM draft fails but the message names a destination", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(null);

    const result = await planTripTool({ userId: USER_ID, message: "安排一趟去杭州的旅行" });

    expect(result).toEqual({ success: false, error: "TRIP_DRAFT_FAILED" });
    expect(prisma.trip.create).not.toHaveBeenCalled();
  });

  it("returns TRIP_PERSIST_FAILED when the database write throws", async () => {
    vi.mocked(llmClient.tryChat).mockResolvedValue(llmResult(draftJson));
    vi.mocked(amapClient.searchPoi).mockResolvedValue(null);
    vi.mocked(prisma.trip.create).mockRejectedValue(new Error("db down"));

    const result = await planTripTool({ userId: USER_ID, message: "帮我规划周末去杭州玩" });

    expect(result).toEqual({ success: false, error: "TRIP_PERSIST_FAILED" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch } from "../agent/toolDispatcher";
import * as storeInsightTool from "../tools/storeInsightTool";
import * as planTripTool from "../tools/planTripTool";
import type { StoreInsightsOverview, TripResult } from "@fairy/shared";

vi.mock("../tools/storeInsightTool");
vi.mock("../tools/planTripTool");

const overviewFixture: StoreInsightsOverview = {
  popularMovies: [
    { movieId: "m-1", title: "海蒂", borrowCount: 3, recommendCount: 5, inStock: true },
  ],
  trend: [{ date: "2026-08-25", borrowCount: 1, returnCount: 0 }],
  inventory: { activeRentals: 2, borrowedRatio: 0.4, lowStockMovies: [] },
  moods: [{ value: "治愈", count: 2 }],
  scenes: [{ value: "雨天", count: 1 }],
  activity: { totalUsers: 3, activeUsers7d: 2, newUsers7d: 1 },
};

describe("dispatch insight tool (FU-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows an admin and returns the full overview", async () => {
    vi.mocked(storeInsightTool.storeInsightTool).mockResolvedValue({
      success: true,
      data: overviewFixture,
    });

    const observation = await dispatch(
      { tool: "insight", topic: "popular" },
      "user-1",
      "admin"
    );

    expect(observation).toEqual({
      kind: "insight",
      success: true,
      forbidden: false,
      topic: "popular",
      overview: overviewFixture,
      code: "OK",
    });
    expect(storeInsightTool.storeInsightTool).toHaveBeenCalledTimes(1);
  });

  it("forbids a non-admin without calling the tool", async () => {
    const observation = await dispatch(
      { tool: "insight", topic: "inventory" },
      "user-1",
      "user"
    );

    expect(observation).toEqual({
      kind: "insight",
      success: false,
      forbidden: true,
      topic: "inventory",
      overview: null,
      code: "FORBIDDEN",
    });
    expect(storeInsightTool.storeInsightTool).not.toHaveBeenCalled();
  });

  it("defaults to a non-admin when no role is given", async () => {
    const observation = await dispatch({ tool: "insight", topic: "overview" }, "user-1");

    expect(observation).toMatchObject({ kind: "insight", forbidden: true });
    expect(storeInsightTool.storeInsightTool).not.toHaveBeenCalled();
  });

  it("surfaces tool failure as an unavailable code", async () => {
    vi.mocked(storeInsightTool.storeInsightTool).mockResolvedValue({
      success: false,
      error: "INSIGHT_UNAVAILABLE",
    });

    const observation = await dispatch(
      { tool: "insight", topic: "trend" },
      "user-1",
      "admin"
    );

    expect(observation).toEqual({
      kind: "insight",
      success: false,
      forbidden: false,
      topic: "trend",
      overview: null,
      code: "INSIGHT_UNAVAILABLE",
    });
  });
});

describe("dispatch trip tool (FU-13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const tripResult: TripResult = {
    tripId: "550e8400-e29b-41d4-a716-446655440000",
    destination: "杭州",
    days: 1,
    itinerary: [
      {
        day: 1,
        title: "西湖经典一日",
        steps: [
          {
            time: "09:00",
            name: "西湖",
            category: "景点",
            note: null,
            location: { lng: 120.15, lat: 30.25 },
            validated: true,
          },
        ],
      },
    ],
    route: null,
    validated: true,
  };

  it("maps a successful trip plan and forwards the user message", async () => {
    vi.mocked(planTripTool.planTripTool).mockResolvedValue({
      success: true,
      data: tripResult,
    });

    const observation = await dispatch(
      { tool: "trip" },
      "user-1",
      "user",
      "帮我规划周末去杭州玩"
    );

    expect(observation).toEqual({
      kind: "trip",
      success: true,
      unresolved: false,
      trip: tripResult,
      code: "OK",
    });
    expect(planTripTool.planTripTool).toHaveBeenCalledWith({
      userId: "user-1",
      message: "帮我规划周末去杭州玩",
    });
  });

  it("flags a missing destination as unresolved", async () => {
    vi.mocked(planTripTool.planTripTool).mockResolvedValue({
      success: true,
      data: { unresolved: true },
    });

    const observation = await dispatch({ tool: "trip" }, "user-1", "user", "帮我规划个行程");

    expect(observation).toEqual({
      kind: "trip",
      success: true,
      unresolved: true,
      trip: null,
      code: "TRIP_DESTINATION_REQUIRED",
    });
  });

  it("surfaces tool failure as a draft/persist error code", async () => {
    vi.mocked(planTripTool.planTripTool).mockResolvedValue({
      success: false,
      error: "TRIP_DRAFT_FAILED",
    });

    const observation = await dispatch({ tool: "trip" }, "user-1", "user", "帮我规划周末去杭州玩");

    expect(observation).toEqual({
      kind: "trip",
      success: false,
      unresolved: false,
      trip: null,
      code: "TRIP_DRAFT_FAILED",
    });
  });
});

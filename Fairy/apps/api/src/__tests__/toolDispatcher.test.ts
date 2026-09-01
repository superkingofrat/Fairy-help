import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch } from "../agent/toolDispatcher";
import * as storeInsightTool from "../tools/storeInsightTool";
import type { StoreInsightsOverview } from "@fairy/shared";

vi.mock("../tools/storeInsightTool");

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

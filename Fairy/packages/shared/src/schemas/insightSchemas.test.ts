import { describe, expect, it } from "vitest";
import {
  storeInsightsOverviewSchema,
  popularMovieItemSchema,
  dailyBorrowPointSchema,
  lowStockMovieItemSchema,
  moodSceneCountSchema,
  activityOverviewSchema,
  inventoryStatusSchema,
  insightTopicSchema,
  INSIGHT_TOPICS,
} from "./insightSchemas.js";

const overviewFixture = {
  popularMovies: [
    {
      movieId: "m-1",
      title: "海蒂",
      borrowCount: 3,
      recommendCount: 5,
      inStock: true,
    },
  ],
  trend: [
    { date: "2026-08-25", borrowCount: 1, returnCount: 0 },
    { date: "2026-08-26", borrowCount: 0, returnCount: 1 },
  ],
  inventory: {
    activeRentals: 2,
    borrowedRatio: 0.4,
    lowStockMovies: [{ movieId: "m-2", title: "楚门的世界", stock: 0, totalStock: 2 }],
  },
  moods: [
    { value: "治愈", count: 2 },
    { value: "悬疑", count: 1 },
  ],
  scenes: [{ value: "雨天", count: 2 }],
  activity: { totalUsers: 3, activeUsers7d: 2, newUsers7d: 1 },
};

describe("storeInsightsOverviewSchema", () => {
  it("accepts a complete overview payload", () => {
    const result = storeInsightsOverviewSchema.safeParse(overviewFixture);
    expect(result.success).toBe(true);
  });

  it("accepts empty collections", () => {
    const result = storeInsightsOverviewSchema.safeParse({
      popularMovies: [],
      trend: [],
      inventory: { activeRentals: 0, borrowedRatio: 0, lowStockMovies: [] },
      moods: [],
      scenes: [],
      activity: { totalUsers: 0, activeUsers7d: 0, newUsers7d: 0 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative counts and out-of-range ratios", () => {
    const negative = {
      ...overviewFixture,
      popularMovies: [{ ...overviewFixture.popularMovies[0], borrowCount: -1 }],
    };
    expect(storeInsightsOverviewSchema.safeParse(negative).success).toBe(false);

    const badRatio = {
      ...overviewFixture,
      inventory: { ...overviewFixture.inventory, borrowedRatio: 1.5 },
    };
    expect(storeInsightsOverviewSchema.safeParse(badRatio).success).toBe(false);
  });
});

describe("insightTopicSchema", () => {
  it("accepts every declared topic", () => {
    for (const topic of INSIGHT_TOPICS) {
      expect(insightTopicSchema.safeParse(topic).success).toBe(true);
    }
  });

  it("rejects unknown topics", () => {
    expect(insightTopicSchema.safeParse("sales").success).toBe(false);
    expect(insightTopicSchema.safeParse("").success).toBe(false);
  });
});

describe("row schemas", () => {
  it("popularMovieItemSchema validates its fields", () => {
    expect(
      popularMovieItemSchema.safeParse({
        movieId: "m-1",
        title: "海蒂",
        borrowCount: 0,
        recommendCount: 0,
        inStock: false,
      }).success,
    ).toBe(true);
    expect(
      popularMovieItemSchema.safeParse({
        movieId: "m-1",
        title: "海蒂",
        borrowCount: 0,
        recommendCount: 0,
        inStock: "yes",
      }).success,
    ).toBe(false);
  });

  it("dailyBorrowPointSchema requires nonnegative counts", () => {
    expect(
      dailyBorrowPointSchema.safeParse({
        date: "2026-08-25",
        borrowCount: 1,
        returnCount: 0,
      }).success,
    ).toBe(true);
    expect(
      dailyBorrowPointSchema.safeParse({
        date: "2026-08-25",
        borrowCount: 1,
        returnCount: -1,
      }).success,
    ).toBe(false);
  });

  it("lowStockMovieItemSchema validates stock fields", () => {
    expect(
      lowStockMovieItemSchema.safeParse({
        movieId: "m-2",
        title: "楚门的世界",
        stock: 1,
        totalStock: 3,
      }).success,
    ).toBe(true);
  });

  it("moodSceneCountSchema requires a value and count", () => {
    expect(moodSceneCountSchema.safeParse({ value: "治愈", count: 2 }).success).toBe(true);
    expect(moodSceneCountSchema.safeParse({ count: 2 }).success).toBe(false);
  });

  it("activityOverviewSchema validates counters", () => {
    expect(
      activityOverviewSchema.safeParse({
        totalUsers: 3,
        activeUsers7d: 2,
        newUsers7d: 1,
      }).success,
    ).toBe(true);
  });

  it("inventoryStatusSchema validates ratio bounds", () => {
    expect(
      inventoryStatusSchema.safeParse({
        activeRentals: 2,
        borrowedRatio: 1,
        lowStockMovies: [],
      }).success,
    ).toBe(true);
    expect(
      inventoryStatusSchema.safeParse({
        activeRentals: 2,
        borrowedRatio: -0.1,
        lowStockMovies: [],
      }).success,
    ).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import {
  getStoreInsightsOverview,
  localMidnight,
  toLocalDateKey,
} from "../services/insightService";

vi.mock("@fairy/database", () => ({
  prisma: {
    rental: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    movie: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    behaviorLog: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
  },
}));

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-08-31T12:00:00.000Z");

describe("getStoreInsightsOverview", () => {
  const borrowA = new Date(now.getTime() - DAY);
  const borrowB = new Date(now.getTime() - 3 * DAY);
  const returnC = new Date(now.getTime() - 2 * DAY);

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.rental.groupBy).mockResolvedValue([
      { movieId: "m1", _count: { _all: 3 } },
      { movieId: "m2", _count: { _all: 1 } },
    ] as never);
    vi.mocked(prisma.behaviorLog.findMany).mockResolvedValue([
      { payload: { movieIds: ["m1", "m1", "m2"] } },
      { payload: { movieIds: ["m1"] } },
      { payload: null },
    ] as never);
    vi.mocked(prisma.rental.findMany)
      .mockResolvedValueOnce([{ createdAt: borrowA }, { createdAt: borrowB }] as never)
      .mockResolvedValueOnce([{ updatedAt: returnC }] as never)
      .mockResolvedValueOnce([{ movieId: "m1" }, { movieId: "m2" }] as never);
    vi.mocked(prisma.rental.count).mockResolvedValue(2);
    vi.mocked(prisma.movie.aggregate).mockResolvedValue({
      _sum: { totalStock: 7 },
    } as never);
    vi.mocked(prisma.movie.findMany)
      .mockResolvedValueOnce([
        { id: "m2", title: "楚门的世界", stock: 0, totalStock: 2 },
        { id: "m3", title: "小王子", stock: 1, totalStock: 1 },
      ] as never)
      .mockResolvedValueOnce([
        { id: "m1", title: "海蒂", stock: 1 },
        { id: "m2", title: "楚门的世界", stock: 0 },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "m1",
          moods: ["HEALING", "HEALING", "HEALING"],
          scenes: ["RAINY_DAY", "RAINY_DAY"],
        },
        {
          id: "m2",
          moods: ["SUSPENSE", "SUSPENSE"],
          scenes: ["INSOMNIA"],
        },
      ] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    vi.mocked(prisma.behaviorLog.groupBy).mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
    ] as never);
  });

  it("aggregates popular movies with borrow and recommend counts", async () => {
    const overview = await getStoreInsightsOverview(now);

    expect(overview.popularMovies).toEqual([
      { movieId: "m1", title: "海蒂", borrowCount: 3, recommendCount: 3, inStock: true },
      { movieId: "m2", title: "楚门的世界", borrowCount: 1, recommendCount: 1, inStock: false },
    ]);
  });

  it("builds a 14-day trend with zero-filled days", async () => {
    const overview = await getStoreInsightsOverview(now);

    expect(overview.trend).toHaveLength(14);
    expect(overview.trend[0].date).toBe(
      toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13)),
    );
    expect(overview.trend[13].date).toBe(toLocalDateKey(now));
    expect(
      overview.trend.find((point) => point.date === toLocalDateKey(borrowA))?.borrowCount,
    ).toBe(1);
    expect(
      overview.trend.find((point) => point.date === toLocalDateKey(borrowB))?.borrowCount,
    ).toBe(1);
    expect(
      overview.trend.find((point) => point.date === toLocalDateKey(returnC))?.returnCount,
    ).toBe(1);
    expect(
      overview.trend.find((point) => point.date === toLocalDateKey(borrowA))?.returnCount,
    ).toBe(0);
  });

  it("reports inventory status with low-stock movies and ratio", async () => {
    const overview = await getStoreInsightsOverview(now);

    expect(overview.inventory.activeRentals).toBe(2);
    expect(overview.inventory.borrowedRatio).toBeCloseTo(2 / 7, 5);
    expect(overview.inventory.lowStockMovies).toEqual([
      { movieId: "m2", title: "楚门的世界", stock: 0, totalStock: 2 },
      { movieId: "m3", title: "小王子", stock: 1, totalStock: 1 },
    ]);
  });

  it("maps prisma mood/scene enums to zh labels and ranks top 5", async () => {
    const overview = await getStoreInsightsOverview(now);

    expect(overview.moods).toEqual([
      { value: "治愈", count: 3 },
      { value: "悬疑", count: 2 },
    ]);
    expect(overview.scenes).toEqual([
      { value: "雨天", count: 2 },
      { value: "失眠夜", count: 1 },
    ]);
  });

  it("reports activity overview", async () => {
    const overview = await getStoreInsightsOverview(now);

    expect(overview.activity).toEqual({
      totalUsers: 4,
      activeUsers7d: 2,
      newUsers7d: 1,
    });
  });

  it("handles an empty store gracefully", async () => {
    vi.mocked(prisma.rental.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.behaviorLog.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.rental.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.movie.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.rental.count).mockResolvedValue(0);
    vi.mocked(prisma.movie.aggregate).mockResolvedValue({
      _sum: { totalStock: null },
    } as never);
    vi.mocked(prisma.user.count).mockReset().mockResolvedValue(0);
    vi.mocked(prisma.behaviorLog.groupBy).mockResolvedValue([] as never);

    const overview = await getStoreInsightsOverview(now);

    expect(overview.popularMovies).toEqual([]);
    expect(overview.trend).toHaveLength(14);
    expect(overview.trend.every((point) => point.borrowCount === 0)).toBe(true);
    expect(overview.inventory).toEqual({
      activeRentals: 0,
      borrowedRatio: 0,
      lowStockMovies: [],
    });
    expect(overview.moods).toEqual([]);
    expect(overview.scenes).toEqual([]);
    expect(overview.activity).toEqual({
      totalUsers: 0,
      activeUsers7d: 0,
      newUsers7d: 0,
    });
  });
});

describe("localMidnight", () => {
  it("returns local midnight of the given calendar day, not UTC midnight", () => {
    const afternoon = new Date(2026, 7, 31, 15, 30, 45, 500);

    const midnight = localMidnight(afternoon);

    // UTC+8 下 UTC 午夜等于本地 08:00，会让趋势首日丢掉 00:00-08:00 的数据
    expect(midnight.getTime()).toBe(new Date(2026, 7, 31).getTime());
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getSeconds()).toBe(0);
    expect(midnight.getMilliseconds()).toBe(0);
  });

  it("keeps the calendar day when the input is already local midnight", () => {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);

    expect(localMidnight(firstDay).getTime()).toBe(firstDay.getTime());
    expect(toLocalDateKey(localMidnight(firstDay))).toBe(toLocalDateKey(firstDay));
  });
});

describe("trend window boundary", () => {
  it("starts the borrow window at local midnight of the first trend day", async () => {
    await getStoreInsightsOverview(now);

    const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
    const [borrowQuery] = vi.mocked(prisma.rental.findMany).mock.calls[0];
    expect(borrowQuery).toEqual(
      expect.objectContaining({ where: { createdAt: { gte: firstDay } } }),
    );
  });
});

describe("recommend log window", () => {
  it("windows the RECOMMEND log query to the last 30 days", async () => {
    await getStoreInsightsOverview(now);

    // behavior_logs 只增不减：全表累计的 recommendCount 会让看板成本随流水线性增长
    const distStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const [recommendQuery] = vi.mocked(prisma.behaviorLog.findMany).mock.calls[0];
    expect(recommendQuery).toEqual(
      expect.objectContaining({
        where: { action: "RECOMMEND", createdAt: { gte: distStart } },
      }),
    );
  });
});

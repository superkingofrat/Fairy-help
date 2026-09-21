import { prisma } from "@fairy/database";
import type {
  ActivityOverview,
  DailyBorrowPoint,
  InventoryStatus,
  LowStockMovieItem,
  MoodSceneCount,
  PopularMovieItem,
  StoreInsightsOverview,
} from "@fairy/shared";
import { PRISMA_TO_MOOD, PRISMA_TO_SCENE } from "./movieService";

// FU-11：只读聚合，供 /admin/insights 看板消费；阈值与窗口均为契约常量。
export const LOW_STOCK_THRESHOLD = 1;
export const TREND_DAYS = 14;
export const DISTRIBUTION_DAYS = 30;
export const ACTIVITY_DAYS = 7;
export const POPULAR_LIMIT = 5;

/** 服务器本地日期的 yyyy-mm-dd 键（测试与实现共用同一公式，保证确定性）。 */
export function toLocalDateKey(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * 服务器本地时区下 date 所在日历日的本地午夜（00:00:00.000 本地时间）。
 * 注意不能用 `${toLocalDateKey(date)}T00:00:00.000Z` 构造——那是 UTC 午夜，
 * 在 UTC+8 下等于本地 08:00，会让按本地日分桶的窗口起点前移/后移数小时。
 */
export function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDaysLocal(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function topCounts(map: Map<string, number>, limit: number): MoodSceneCount[] {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

export async function getStoreInsightsOverview(
  now: Date = new Date(),
): Promise<StoreInsightsOverview> {
  const trendStart = localMidnight(addDaysLocal(now, -(TREND_DAYS - 1)));
  const distStart = localMidnight(addDaysLocal(now, -DISTRIBUTION_DAYS));
  const activeStart = localMidnight(addDaysLocal(now, -(ACTIVITY_DAYS - 1)));

  const [
    popularGroup,
    recommendLogs,
    borrows,
    returns,
    activeRentals,
    totalStockAgg,
    lowStockMovies,
    totalUsers,
    activeUserGroups,
    newUsers,
    distRentals,
  ] = await Promise.all([
    prisma.rental.groupBy({
      by: ["movieId"],
      _count: { _all: true },
      orderBy: { _count: { movieId: "desc" } },
      take: POPULAR_LIMIT,
    }),
    prisma.behaviorLog.findMany({
      // recommendCount 与 moods/scenes 共用 DISTRIBUTION_DAYS 窗口：behavior_logs
      // 只增不减，全表累计会让看板查询成本随流水线性增长
      where: { action: "RECOMMEND", createdAt: { gte: distStart } },
      select: { payload: true },
    }),
    prisma.rental.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),
    prisma.rental.findMany({
      where: { status: "RETURNED", updatedAt: { gte: trendStart } },
      select: { updatedAt: true },
    }),
    prisma.rental.count({ where: { status: "ACTIVE" } }),
    prisma.movie.aggregate({ _sum: { totalStock: true } }),
    prisma.movie.findMany({
      where: { stock: { lte: LOW_STOCK_THRESHOLD } },
      select: { id: true, title: true, stock: true, totalStock: true },
      orderBy: { stock: "asc" },
    }),
    prisma.user.count(),
    prisma.behaviorLog.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: activeStart } },
    }),
    prisma.user.count({ where: { createdAt: { gte: activeStart } } }),
    prisma.rental.findMany({
      where: { createdAt: { gte: distStart } },
      select: { movieId: true },
    }),
  ]);

  const popularIds = popularGroup.map((group) => group.movieId);
  const [popularMovies, distMovies] = await Promise.all([
    popularIds.length > 0
      ? prisma.movie.findMany({
          where: { id: { in: popularIds } },
          select: { id: true, title: true, stock: true },
        })
      : Promise.resolve([]),
    distRentals.length > 0
      ? prisma.movie.findMany({
          where: { id: { in: [...new Set(distRentals.map((r) => r.movieId))] } },
          select: { id: true, moods: true, scenes: true },
        })
      : Promise.resolve([]),
  ]);

  const recommendCountByMovie = new Map<string, number>();
  const topIds = new Set(popularIds);
  for (const log of recommendLogs) {
    const movieIds = (log.payload as { movieIds?: unknown } | null)?.movieIds;
    if (!Array.isArray(movieIds)) {
      continue;
    }
    for (const id of movieIds) {
      if (typeof id === "string" && topIds.has(id)) {
        recommendCountByMovie.set(id, (recommendCountByMovie.get(id) ?? 0) + 1);
      }
    }
  }

  const popularMoviesDto: PopularMovieItem[] = popularGroup.map((group) => {
    const movie = popularMovies.find((item) => item.id === group.movieId);
    return {
      movieId: group.movieId,
      title: movie?.title ?? group.movieId,
      borrowCount: (group._count as { _all: number })._all,
      recommendCount: recommendCountByMovie.get(group.movieId) ?? 0,
      inStock: (movie?.stock ?? 0) > 0,
    };
  });

  const borrowByKey = new Map<string, number>();
  for (const rental of borrows) {
    const key = toLocalDateKey(rental.createdAt);
    borrowByKey.set(key, (borrowByKey.get(key) ?? 0) + 1);
  }
  const returnByKey = new Map<string, number>();
  for (const rental of returns) {
    const key = toLocalDateKey(rental.updatedAt);
    returnByKey.set(key, (returnByKey.get(key) ?? 0) + 1);
  }
  const trend: DailyBorrowPoint[] = [];
  for (let day = 0; day < TREND_DAYS; day++) {
    const date = toLocalDateKey(addDaysLocal(now, -(TREND_DAYS - 1) + day));
    trend.push({
      date,
      borrowCount: borrowByKey.get(date) ?? 0,
      returnCount: returnByKey.get(date) ?? 0,
    });
  }

  const totalStock = totalStockAgg._sum.totalStock ?? 0;
  const inventory: InventoryStatus = {
    activeRentals,
    borrowedRatio: totalStock > 0 ? Math.min(1, activeRentals / totalStock) : 0,
    lowStockMovies: lowStockMovies.map((movie): LowStockMovieItem => ({
      movieId: movie.id,
      title: movie.title,
      stock: movie.stock,
      totalStock: movie.totalStock,
    })),
  };

  const moodCount = new Map<string, number>();
  const sceneCount = new Map<string, number>();
  for (const movie of distMovies) {
    for (const mood of movie.moods) {
      const label = PRISMA_TO_MOOD[mood];
      moodCount.set(label, (moodCount.get(label) ?? 0) + 1);
    }
    for (const scene of movie.scenes) {
      const label = PRISMA_TO_SCENE[scene];
      sceneCount.set(label, (sceneCount.get(label) ?? 0) + 1);
    }
  }

  const activity: ActivityOverview = {
    totalUsers,
    activeUsers7d: activeUserGroups.length,
    newUsers7d: newUsers,
  };

  return {
    popularMovies: popularMoviesDto,
    trend,
    inventory,
    moods: topCounts(moodCount, 5),
    scenes: topCounts(sceneCount, 5),
    activity,
  };
}

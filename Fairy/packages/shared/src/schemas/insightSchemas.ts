import { z } from "zod";

// FU-11：store insights 运营看板聚合响应的形状与类型。

export const popularMovieItemSchema = z.object({
  movieId: z.string(),
  title: z.string(),
  borrowCount: z.number().int().nonnegative(),
  recommendCount: z.number().int().nonnegative(),
  inStock: z.boolean(),
});

export const dailyBorrowPointSchema = z.object({
  date: z.string(),
  borrowCount: z.number().int().nonnegative(),
  returnCount: z.number().int().nonnegative(),
});

export const lowStockMovieItemSchema = z.object({
  movieId: z.string(),
  title: z.string(),
  stock: z.number().int().nonnegative(),
  totalStock: z.number().int().nonnegative(),
});

export const moodSceneCountSchema = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
});

export const activityOverviewSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers7d: z.number().int().nonnegative(),
  newUsers7d: z.number().int().nonnegative(),
});

export const inventoryStatusSchema = z.object({
  activeRentals: z.number().int().nonnegative(),
  borrowedRatio: z.number().min(0).max(1),
  lowStockMovies: z.array(lowStockMovieItemSchema),
});

export const storeInsightsOverviewSchema = z.object({
  popularMovies: z.array(popularMovieItemSchema),
  trend: z.array(dailyBorrowPointSchema),
  inventory: inventoryStatusSchema,
  moods: z.array(moodSceneCountSchema),
  scenes: z.array(moodSceneCountSchema),
  activity: activityOverviewSchema,
});

export type PopularMovieItem = z.infer<typeof popularMovieItemSchema>;
export type DailyBorrowPoint = z.infer<typeof dailyBorrowPointSchema>;
export type LowStockMovieItem = z.infer<typeof lowStockMovieItemSchema>;
export type MoodSceneCount = z.infer<typeof moodSceneCountSchema>;
export type ActivityOverview = z.infer<typeof activityOverviewSchema>;
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>;
export type StoreInsightsOverview = z.infer<typeof storeInsightsOverviewSchema>;

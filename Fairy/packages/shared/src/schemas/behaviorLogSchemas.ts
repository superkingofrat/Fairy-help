import { z } from "zod";

export const BEHAVIOR_ACTIONS = [
  "RECOMMEND",
  "BORROW_SUCCESS",
  "BORROW_OUT_OF_STOCK",
  "RETURN_SUCCESS",
  "TRIP_PLANNED",
  "TRIP_UNRESOLVED",
  "TRIP_DRAFT_FAILED",
  "TRIP_PERSIST_FAILED",
] as const;

export type BehaviorActionValue = (typeof BEHAVIOR_ACTIONS)[number];

export const behaviorActionSchema = z.enum(BEHAVIOR_ACTIONS);

export const behaviorLogSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  action: behaviorActionSchema,
  movieId: z.string().nullable(),
  rentalId: z.string().nullable(),
  createdAt: z.string(),
});

export const behaviorLogListItemSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  email: z.string(),
  action: behaviorActionSchema,
  movieId: z.string().nullable(),
  movieTitle: z.string().nullable(),
  rentalId: z.string().nullable(),
  recommendCount: z.number().int().nullable(),
  createdAt: z.string(),
});

export const behaviorLogPaginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export const behaviorLogFeedSchema = z.object({
  items: z.array(behaviorLogListItemSchema),
  pagination: behaviorLogPaginationSchema,
});

export const behaviorLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: behaviorActionSchema.optional(),
  userId: z.string().optional(),
});

export type BehaviorLogQuery = z.infer<typeof behaviorLogQuerySchema>;
export type BehaviorLogListItem = z.infer<typeof behaviorLogListItemSchema>;
export type BehaviorLogFeed = z.infer<typeof behaviorLogFeedSchema>;

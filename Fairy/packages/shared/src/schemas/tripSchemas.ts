import { z } from "zod";

// FU-13：旅行规划共享契约——行程 POI/天/路线/结果，以及 SSE trip 事件。
// 服务端 planTripTool 产出，chat SSE 事件与前端 TripTimeline 消费，落库 payload 回放复用同一形状。

export const tripPoiSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  time: z.string(),
  note: z.string().nullable(),
  location: z
    .object({
      lng: z.number(),
      lat: z.number(),
    })
    .nullable(),
  validated: z.boolean(),
});

export const itineraryDaySchema = z.object({
  day: z.number().int().min(1),
  title: z.string(),
  steps: z.array(tripPoiSchema).min(1),
});

export const routeLegSchema = z.object({
  from: z.string(),
  to: z.string(),
  distanceMeters: z.number().nullable(),
  durationSeconds: z.number().nullable(),
});

export const tripResultSchema = z.object({
  tripId: z.string().uuid(),
  destination: z.string(),
  days: z.number().int().min(1),
  itinerary: z.array(itineraryDaySchema),
  route: z.array(routeLegSchema).nullable(),
  validated: z.boolean(),
});

export const tripEventSchema = z.object({
  type: z.literal("trip"),
  trip: tripResultSchema,
});

// FU-19（旅行规划二期）：REST 主动创建请求——destination 必填由 schema 强制；
// days 可选（1-14），缺省由草稿链路从消息推断（保持一期行为）。
export const tripCreateRequestSchema = z.object({
  destination: z.string().trim().min(1).max(100),
  days: z.number().int().min(1).max(14).optional(),
});

// 二期读取契约：列表项（不含 itinerary/route，列表页够用）、详情（tripResult + createdAt）、
// 查询（分页 + 可选 userId，仅 admin 代查，UUID 校验与越权由 controller 负责）。
export const tripListPaginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export const tripListItemSchema = z.object({
  id: z.string(),
  destination: z.string(),
  days: z.number().int().min(1),
  validated: z.boolean(),
  createdAt: z.string(),
});

export const tripListFeedSchema = z.object({
  items: z.array(tripListItemSchema),
  pagination: tripListPaginationSchema,
});

export const tripListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().optional(),
});

export const tripDetailSchema = tripResultSchema.extend({
  createdAt: z.string(),
});

export type TripCreateRequest = z.infer<typeof tripCreateRequestSchema>;
export type TripListPagination = z.infer<typeof tripListPaginationSchema>;
export type TripListItem = z.infer<typeof tripListItemSchema>;
export type TripListFeed = z.infer<typeof tripListFeedSchema>;
export type TripListQuery = z.infer<typeof tripListQuerySchema>;
export type TripDetail = z.infer<typeof tripDetailSchema>;
export type TripPoi = z.infer<typeof tripPoiSchema>;
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;
export type RouteLeg = z.infer<typeof routeLegSchema>;
export type TripResult = z.infer<typeof tripResultSchema>;
export type TripEvent = z.infer<typeof tripEventSchema>;

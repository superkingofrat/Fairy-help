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

export type TripPoi = z.infer<typeof tripPoiSchema>;
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;
export type RouteLeg = z.infer<typeof routeLegSchema>;
export type TripResult = z.infer<typeof tripResultSchema>;
export type TripEvent = z.infer<typeof tripEventSchema>;

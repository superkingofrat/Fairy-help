import { describe, expect, it } from "vitest";
import {
  tripCompanionSchema,
  tripCreateRequestSchema,
  tripListFeedSchema,
  tripListItemSchema,
  tripListQuerySchema,
  tripDetailSchema,
  tripPoiSchema,
  itineraryDaySchema,
  routeLegSchema,
  tripResultSchema,
  tripEventSchema,
} from "./tripSchemas.js";
import { chatEventSchema } from "./sessionSchemas.js";

const tripResultFixture = {
  tripId: "550e8400-e29b-41d4-a716-446655440000",
  destination: "杭州",
  days: 2,
  itinerary: [
    {
      day: 1,
      title: "西湖经典一日",
      steps: [
        {
          name: "西湖",
          category: "景点",
          time: "09:00",
          note: "环湖散步",
          location: { lng: 120.15, lat: 30.25 },
          validated: true,
        },
      ],
    },
    {
      day: 2,
      title: "灵隐与茶园",
      steps: [
        {
          name: "灵隐寺",
          category: "景点",
          time: "09:30",
          note: null,
          location: null,
          validated: false,
        },
      ],
    },
  ],
  route: [
    {
      from: "西湖",
      to: "灵隐寺",
      distanceMeters: 6500,
      durationSeconds: 1200,
    },
  ],
  validated: true,
};

describe("tripPoiSchema", () => {
  it("accepts a validated POI with location", () => {
    expect(
      tripPoiSchema.safeParse({
        name: "西湖",
        category: "景点",
        time: "09:00",
        note: "环湖散步",
        location: { lng: 120.15, lat: 30.25 },
        validated: true,
      }).success,
    ).toBe(true);
  });

  it("accepts an unvalidated POI without location", () => {
    expect(
      tripPoiSchema.safeParse({
        name: "灵隐寺",
        category: "景点",
        time: "09:30",
        note: null,
        location: null,
        validated: false,
      }).success,
    ).toBe(true);
  });

  it("rejects a missing name or wrong location shape", () => {
    expect(
      tripPoiSchema.safeParse({
        name: "",
        category: "景点",
        time: "09:00",
        note: null,
        location: null,
        validated: false,
      }).success,
    ).toBe(false);
    expect(
      tripPoiSchema.safeParse({
        name: "西湖",
        category: "景点",
        time: "09:00",
        note: null,
        location: { lng: "120.15", lat: 30.25 },
        validated: true,
      }).success,
    ).toBe(false);
  });
});

describe("tripPoiSchema preferenceBasis", () => {
  const basePoi = {
    name: "西湖",
    category: "景点",
    time: "09:00",
    note: null,
    location: null,
    validated: true,
  };

  it("accepts a non-empty basis and an explicit null", () => {
    expect(
      tripPoiSchema.safeParse({ ...basePoi, preferenceBasis: "洁癖 → 避开露天摊位" }).success,
    ).toBe(true);
    expect(tripPoiSchema.safeParse({ ...basePoi, preferenceBasis: null }).success).toBe(true);
  });

  it("treats an absent key as null so stored history still replays", () => {
    const parsed = tripPoiSchema.safeParse(basePoi);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.preferenceBasis).toBe(null);
  });

  it("rejects a non-string and an empty basis", () => {
    expect(tripPoiSchema.safeParse({ ...basePoi, preferenceBasis: 7 }).success).toBe(false);
    expect(tripPoiSchema.safeParse({ ...basePoi, preferenceBasis: "" }).success).toBe(false);
  });

  it("carries the basis through the result, event and detail schemas", () => {
    const withBasis = {
      ...tripResultFixture,
      itinerary: tripResultFixture.itinerary.map((day) => ({
        ...day,
        steps: day.steps.map((step) => ({ ...step, preferenceBasis: "服务型 → 段间留缓冲" })),
      })),
    };
    const event = { type: "trip", trip: withBasis };
    expect(tripResultSchema.safeParse(withBasis).success).toBe(true);
    expect(tripEventSchema.safeParse(event).success).toBe(true);
    expect(chatEventSchema.safeParse(event).success).toBe(true);
    expect(
      tripDetailSchema.safeParse({ ...withBasis, createdAt: "2026-10-16T10:00:00.000Z" }).success,
    ).toBe(true);
  });

  it("keeps a stored trip event without the basis key parseable", () => {
    const stored = { type: "trip", trip: tripResultFixture };
    const parsed = chatEventSchema.safeParse(stored);
    expect(parsed.success).toBe(true);
    expect(
      parsed.success &&
        parsed.data.type === "trip" &&
        parsed.data.trip.itinerary[0].steps[0].preferenceBasis,
    ).toBe(null);
  });
});

describe("itineraryDaySchema / routeLegSchema", () => {
  it("requires day >= 1 and at least one step", () => {
    expect(itineraryDaySchema.safeParse({ day: 0, title: "x", steps: [] }).success).toBe(false);
    expect(itineraryDaySchema.safeParse({ day: 1, title: "x", steps: [] }).success).toBe(false);
    expect(
      itineraryDaySchema.safeParse({
        day: 1,
        title: "x",
        steps: [tripResultFixture.itinerary[0].steps[0]],
      }).success,
    ).toBe(true);
  });

  it("routeLegSchema allows nullable metrics but requires from/to", () => {
    expect(
      routeLegSchema.safeParse({
        from: "西湖",
        to: "灵隐寺",
        distanceMeters: null,
        durationSeconds: null,
      }).success,
    ).toBe(true);
    expect(
      routeLegSchema.safeParse({
        from: "西湖",
        distanceMeters: null,
        durationSeconds: null,
      }).success,
    ).toBe(false);
  });
});

describe("tripResultSchema", () => {
  it("accepts a complete trip result", () => {
    expect(tripResultSchema.safeParse(tripResultFixture).success).toBe(true);
  });

  it("accepts a degraded (unvalidated, no route) result", () => {
    const degraded = {
      ...tripResultFixture,
      validated: false,
      route: null,
      itinerary: tripResultFixture.itinerary.map((day) => ({
        ...day,
        steps: day.steps.map((step) => ({ ...step, location: null, validated: false })),
      })),
    };
    expect(tripResultSchema.safeParse(degraded).success).toBe(true);
  });

  it("rejects an invalid tripId", () => {
    expect(tripResultSchema.safeParse({ ...tripResultFixture, tripId: "not-a-uuid" }).success).toBe(
      false,
    );
  });
});

describe("tripCompanionSchema", () => {
  const companion = { name: "莱卡恩", userId: "11111111-1111-4111-8111-111111111111" };

  it("accepts a companion snapshot", () => {
    expect(tripCompanionSchema.safeParse(companion).success).toBe(true);
  });

  it("rejects a missing name or empty userId", () => {
    expect(tripCompanionSchema.safeParse({ userId: companion.userId }).success).toBe(false);
    expect(tripCompanionSchema.safeParse({ name: "莱卡恩", userId: "" }).success).toBe(false);
    expect(tripCompanionSchema.safeParse({ name: "莱卡恩", userId: 7 }).success).toBe(false);
  });

  it("treats an absent companion key as null (stored history compatibility)", () => {
    const parsed = tripResultSchema.safeParse(tripResultFixture);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.companion).toBe(null);
  });

  it("accepts an explicit null and a companion on the trip result", () => {
    expect(tripResultSchema.safeParse({ ...tripResultFixture, companion: null }).success).toBe(
      true,
    );
    expect(tripResultSchema.safeParse({ ...tripResultFixture, companion }).success).toBe(true);
  });

  it("rejects a half-populated companion", () => {
    expect(
      tripResultSchema.safeParse({ ...tripResultFixture, companion: { name: "莱卡恩" } }).success,
    ).toBe(false);
  });

  it("carries the companion through the chat event and the detail schema", () => {
    const event = { type: "trip", trip: { ...tripResultFixture, companion } };
    expect(tripEventSchema.safeParse(event).success).toBe(true);
    expect(chatEventSchema.safeParse(event).success).toBe(true);
    const detail = { ...tripResultFixture, companion, createdAt: "2026-10-11T10:00:00.000Z" };
    expect(tripDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("keeps a stored trip event without the companion key parseable", () => {
    const stored = { type: "trip", trip: tripResultFixture };
    const parsed = chatEventSchema.safeParse(stored);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.type === "trip" && parsed.data.trip.companion).toBe(null);
  });
});

describe("trip event in chatEventSchema", () => {
  it("accepts a trip event as a chat event member", () => {
    const event = { type: "trip", trip: tripResultFixture };
    expect(tripEventSchema.safeParse(event).success).toBe(true);
    expect(chatEventSchema.safeParse(event).success).toBe(true);
  });

  it("still rejects unknown event types", () => {
    expect(chatEventSchema.safeParse({ type: "weather" }).success).toBe(false);
  });
});

describe("tripCreateRequestSchema (FU-19 phase 2)", () => {
  it("accepts destination with optional days", () => {
    expect(tripCreateRequestSchema.safeParse({ destination: "杭州", days: 2 }).success).toBe(true);
    expect(tripCreateRequestSchema.safeParse({ destination: "杭州" }).success).toBe(true);
  });

  it("rejects missing/oversized destination and out-of-range days", () => {
    expect(tripCreateRequestSchema.safeParse({}).success).toBe(false);
    expect(tripCreateRequestSchema.safeParse({ destination: "" }).success).toBe(false);
    expect(tripCreateRequestSchema.safeParse({ destination: "x".repeat(101) }).success).toBe(false);
    expect(tripCreateRequestSchema.safeParse({ destination: "杭州", days: 0 }).success).toBe(false);
    expect(tripCreateRequestSchema.safeParse({ destination: "杭州", days: 15 }).success).toBe(
      false,
    );
    expect(tripCreateRequestSchema.safeParse({ destination: "杭州", days: 2.5 }).success).toBe(
      false,
    );
  });

  it("strips unknown keys", () => {
    const parsed = tripCreateRequestSchema.safeParse({ destination: "杭州", role: "admin" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ destination: "杭州" });
  });
});

describe("trip list schemas (FU-19 phase 2)", () => {
  const listItemFixture = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    destination: "杭州",
    days: 2,
    validated: false,
    createdAt: "2026-09-22T10:00:00.000Z",
  };

  it("accepts a list item and feed with pagination", () => {
    expect(tripListItemSchema.safeParse(listItemFixture).success).toBe(true);
    const feed = {
      items: [listItemFixture],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    expect(tripListFeedSchema.safeParse(feed).success).toBe(true);
  });

  it("tripListQuerySchema defaults page/limit and coerces strings", () => {
    const parsed = tripListQuerySchema.safeParse({ page: "2", limit: "5", userId: "abc" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ page: 2, limit: 5, userId: "abc" });
  });

  it("tripListQuerySchema rejects out-of-range pagination", () => {
    expect(tripListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(tripListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("tripDetailSchema (FU-19 phase 2)", () => {
  it("extends the trip result with createdAt", () => {
    const detail = { ...tripResultFixture, createdAt: "2026-09-22T10:00:00.000Z" };
    expect(tripDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("rejects a result missing createdAt", () => {
    expect(tripDetailSchema.safeParse(tripResultFixture).success).toBe(false);
  });
});

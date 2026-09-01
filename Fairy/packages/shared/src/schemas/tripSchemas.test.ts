import { describe, expect, it } from "vitest";
import {
  tripPoiSchema,
  itineraryDaySchema,
  routeLegSchema,
  tripResultSchema,
  tripEventSchema,
} from "./tripSchemas";
import { chatEventSchema } from "./sessionSchemas";

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

describe("itineraryDaySchema / routeLegSchema", () => {
  it("requires day >= 1 and at least one step", () => {
    expect(
      itineraryDaySchema.safeParse({ day: 0, title: "x", steps: [] }).success,
    ).toBe(false);
    expect(itineraryDaySchema.safeParse({ day: 1, title: "x", steps: [] }).success).toBe(
      false
    );
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
    expect(
      tripResultSchema.safeParse({ ...tripResultFixture, tripId: "not-a-uuid" }).success,
    ).toBe(false);
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

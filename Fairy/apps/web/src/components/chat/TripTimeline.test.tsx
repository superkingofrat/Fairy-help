import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TripTimeline } from "./TripTimeline";
import type { TripResult } from "@fairy/shared";

const tripResult: TripResult = {
  tripId: "550e8400-e29b-41d4-a716-446655440000",
  destination: "杭州",
  days: 1,
  itinerary: [
    {
      day: 1,
      title: "西湖经典一日",
      steps: [
        {
          time: "09:00",
          name: "西湖",
          category: "景点",
          note: null,
          location: { lng: 120.15, lat: 30.25 },
          validated: true,
        },
        {
          time: "15:00",
          name: "河坊街",
          category: "美食",
          note: "逛夜市",
          location: null,
          validated: false,
        },
      ],
    },
  ],
  route: [{ from: "西湖", to: "河坊街", distanceMeters: 2100, durationSeconds: 480 }],
  validated: true,
};

describe("TripTimeline", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders destination, days, steps and a route summary", () => {
    render(<TripTimeline trip={tripResult} />);

    expect(screen.getByText(/杭州/)).toBeDefined();
    expect(screen.getByText(/共 1 天/)).toBeDefined();
    expect(screen.getByText(/西湖经典一日/)).toBeDefined();
    expect(screen.getByText("西湖")).toBeDefined();
    expect(screen.getByText("河坊街")).toBeDefined();
    expect(screen.getByText("09:00")).toBeDefined();
    expect(screen.getByText(/驾车路线/)).toBeDefined();
    expect(screen.getByText(/全程约 2.1 公里，车程约 8 分钟/)).toBeDefined();
  });

  it("marks a validated trip and hides per-step unverified labels", () => {
    render(<TripTimeline trip={tripResult} />);

    expect(screen.getByText("地点已核实")).toBeDefined();
    expect(screen.getAllByText("未核实")).toHaveLength(1);
  });

  it("flags an unvalidated trip and omits the route line", () => {
    render(
      <TripTimeline
        trip={{
          ...tripResult,
          validated: false,
          route: null,
          itinerary: [
            {
              ...tripResult.itinerary[0],
              steps: [{ ...tripResult.itinerary[0].steps[0], validated: false, location: null }],
            },
          ],
        }}
      />
    );

    expect(screen.getByText("未验证")).toBeDefined();
    expect(screen.getAllByText("未核实")).toHaveLength(1);
    expect(screen.queryByText(/驾车路线/)).toBeNull();
  });
});

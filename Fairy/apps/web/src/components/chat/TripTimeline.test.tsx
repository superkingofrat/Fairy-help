import { afterEach, describe, expect, it, vi } from "vitest";
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
          preferenceBasis: null,
          location: { lng: 120.15, lat: 30.25 },
          validated: true,
        },
        {
          time: "15:00",
          name: "河坊街",
          category: "美食",
          note: "逛夜市",
          preferenceBasis: null,
          location: null,
          validated: false,
        },
      ],
    },
  ],
  route: [{ from: "西湖", to: "河坊街", distanceMeters: 2100, durationSeconds: 480 }],
  validated: true,
  companion: null,
};

describe("TripTimeline", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
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
      />,
    );

    expect(screen.getByText("未验证")).toBeDefined();
    expect(screen.getAllByText("未核实")).toHaveLength(1);
    expect(screen.queryByText(/驾车路线/)).toBeNull();
  });

  // FU-20：同行人快照来自行程事实（两列投影），不是从用户消息里猜的名字
  it("names the companion next to the day count when the trip has one", () => {
    render(
      <TripTimeline
        trip={{
          ...tripResult,
          companion: { name: "莱卡恩", userId: "00000000-0000-4000-8000-0000000000c1" },
        }}
      />,
    );

    expect(screen.getByText(/与 莱卡恩 同行/)).toBeDefined();
    expect(screen.getByText(/共 1 天 · 与 莱卡恩 同行/)).toBeDefined();
  });

  it("renders no companion line when the trip has none", () => {
    render(<TripTimeline trip={tripResult} />);

    expect(screen.getByText(/共 1 天/)).toBeDefined();
    expect(screen.queryByText(/同行/)).toBeNull();
  });

  // FU-19 二期：地图槽位随卡片渲染；TripMap 内部按 key/坐标/加载失败静默降级
  it("renders the map area when a browser key and coordinates are present", () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "browser-key");

    render(<TripTimeline trip={tripResult} />);

    expect(screen.getByTestId("trip-map")).toBeDefined();
    expect(screen.getByText(/共 1 天/)).toBeDefined();
  });

  it("renders no map area without a browser key while keeping the itinerary", () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");

    render(<TripTimeline trip={tripResult} />);

    expect(screen.queryByTestId("trip-map")).toBeNull();
    expect(screen.getByText(/全程约 2.1 公里，车程约 8 分钟/)).toBeDefined();
  });

  // FU-21：偏好依据——个性化从「看不见」变「看得见」的落点
  const tripWithBasis: TripResult = {
    ...tripResult,
    itinerary: [
      {
        ...tripResult.itinerary[0],
        steps: [{ ...tripResult.itinerary[0].steps[0], preferenceBasis: "洁癖 → 避开露天摊位" }],
      },
    ],
  };

  it("shows the preference basis on the step that earned it", () => {
    render(<TripTimeline trip={tripWithBasis} />);

    expect(screen.getByText("偏好依据：洁癖 → 避开露天摊位")).toBeDefined();
  });

  it("renders no basis text and no placeholder when every basis is null", () => {
    render(<TripTimeline trip={tripResult} />);

    // 无依据时不渲染、不占位：回放存量行程与改动前逐字一致
    expect(screen.queryByText(/偏好依据/)).toBeNull();
  });

  it("shows a basis that came from the caller's own travel style, without a companion", () => {
    render(<TripTimeline trip={{ ...tripWithBasis, companion: null }} />);

    // 依据不依赖同行人存在（本人旅行风格同样能产出依据），此时也不拼同行人名
    expect(screen.getByText("偏好依据：洁癖 → 避开露天摊位")).toBeDefined();
    expect(screen.queryByText(/同行/)).toBeNull();
  });
});

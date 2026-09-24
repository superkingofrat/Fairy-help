import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { TripPoi, TripResult } from "@fairy/shared";

// FU-19 二期：TripMap 降级与叠加行为。不加载真实高德脚本——预置 window.AMap 或派发 script
// load/error 事件，断言构造参数与静默撤容器。假命名空间刻意复刻真实高德 2.0 的坐标类型约束
// （只认 LngLat 实例，裸对象归一成 NaN），否则组件传错坐标类型测试也会放行。

type LngLat = NonNullable<TripPoi["location"]>;

const locatedFirst: LngLat = { lng: 120.15, lat: 30.25 };
const locatedSecond: LngLat = { lng: 120.1, lat: 30.24 };

const tripWithRoute: TripResult = {
  tripId: "550e8400-e29b-41d4-a716-446655440000",
  destination: "杭州",
  days: 2,
  itinerary: [
    {
      day: 1,
      title: "西湖经典",
      steps: [
        {
          time: "09:00",
          name: "西湖",
          category: "景点",
          note: null,
          location: locatedFirst,
          validated: true,
        },
        {
          time: "15:00",
          name: "河坊街",
          category: "美食",
          note: null,
          location: null,
          validated: false,
        },
      ],
    },
    {
      day: 2,
      title: "灵隐",
      steps: [
        {
          time: "09:00",
          name: "灵隐寺",
          category: "景点",
          note: null,
          location: locatedSecond,
          validated: true,
        },
      ],
    },
  ],
  route: [{ from: "西湖", to: "灵隐寺", distanceMeters: 8000, durationSeconds: 1200 }],
  validated: true,
};

const tripWithoutRoute: TripResult = { ...tripWithRoute, route: null };

const tripWithoutCoordinates: TripResult = {
  ...tripWithRoute,
  itinerary: tripWithRoute.itinerary.map((day) => ({
    ...day,
    steps: day.steps.map((step) => ({ ...step, location: null, validated: false })),
  })),
  route: null,
  validated: false,
};

interface MarkerCall {
  position: LngLat;
  title: string;
}

let mapCalls: Array<{ container: HTMLElement; options: { zoom: number; center: LngLat } }> = [];
let markerCalls: MarkerCall[] = [];
let polylineCalls: Array<{ path: LngLat[] }> = [];
let destroyedMaps = 0;

// 真实高德 2.0 只认 LngLat 实例：裸 {lng,lat} 对象会被归一成 NaN，覆盖物构造时才抛
// Pixel(NaN,NaN)——假命名空间必须同样严格，否则组件传错坐标类型也测不出来
class FakeLngLat {
  constructor(
    public readonly lng: number,
    public readonly lat: number,
  ) {}
}

function assertLngLat(value: unknown): void {
  if (!(value instanceof FakeLngLat)) {
    throw new Error(`Invalid Object: LngLat(NaN, NaN) (got ${typeof value})`);
  }
}

function installAmapGlobal(): void {
  class FakeMap {
    setFitView = vi.fn();
    destroy = vi.fn(() => {
      destroyedMaps += 1;
    });

    constructor(container: HTMLElement, options: { zoom: number; center: LngLat }) {
      assertLngLat(options.center);
      mapCalls.push({ container, options });
    }
  }
  class FakeMarker {
    setMap = vi.fn();

    constructor(options: MarkerCall & { map: FakeMap }) {
      assertLngLat(options.position);
      markerCalls.push({ position: options.position, title: options.title });
    }
  }
  class FakePolyline {
    setMap = vi.fn();

    constructor(options: { path: LngLat[]; map: FakeMap }) {
      options.path.forEach(assertLngLat);
      polylineCalls.push({ path: options.path });
    }
  }
  vi.stubGlobal("AMap", {
    LngLat: FakeLngLat,
    Map: FakeMap,
    Marker: FakeMarker,
    Polyline: FakePolyline,
  });
}

async function renderTripMap(trip: TripResult): Promise<void> {
  const { TripMap } = await import("./TripMap");
  render(<TripMap trip={trip} />);
}

describe("TripMap", () => {
  beforeEach(() => {
    mapCalls = [];
    markerCalls = [];
    polylineCalls = [];
    destroyedMaps = 0;
    // 模块级加载单例按用例隔离：每个用例动态 import 拿到全新模块实例
    vi.resetModules();
    vi.stubEnv("VITE_AMAP_JS_KEY", "browser-key");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders nothing when no browser key is configured", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");

    await renderTripMap(tripWithRoute);

    expect(screen.queryByTestId("trip-map")).toBeNull();
    expect(mapCalls).toHaveLength(0);
  });

  it("renders nothing when no POI carries coordinates", async () => {
    await renderTripMap(tripWithoutCoordinates);

    expect(screen.queryByTestId("trip-map")).toBeNull();
    expect(mapCalls).toHaveLength(0);
  });

  it("renders markers for located POIs and a polyline for route legs", async () => {
    installAmapGlobal();

    await renderTripMap(tripWithRoute);

    await waitFor(() => expect(mapCalls).toHaveLength(1));
    // 首个有坐标 POI 作为中心点——必须是 LngLat 实例（真实高德对裸对象抛 NaN）
    expect(mapCalls[0].options.center).toBeInstanceOf(FakeLngLat);
    expect(mapCalls[0].options.center.lng).toBe(locatedFirst.lng);
    expect(mapCalls[0].options.center.lat).toBe(locatedFirst.lat);
    expect(mapCalls[0].options.zoom).toBe(11);
    expect(screen.getByTestId("trip-map")).toBeDefined();
    // 仅两个有坐标 POI 生成 Marker，无坐标的河坊街被跳过
    expect(markerCalls).toEqual([
      { position: expect.any(FakeLngLat), title: "西湖" },
      { position: expect.any(FakeLngLat), title: "灵隐寺" },
    ]);
    expect(markerCalls[0].position.lng).toBe(locatedFirst.lng);
    expect(markerCalls[0].position.lat).toBe(locatedFirst.lat);
    expect(markerCalls[1].position.lng).toBe(locatedSecond.lng);
    expect(markerCalls[1].position.lat).toBe(locatedSecond.lat);
    // 折线点按行程顺序取有坐标 POI，route 非空才绘制
    expect(polylineCalls).toHaveLength(1);
    expect(polylineCalls[0].path).toEqual([expect.any(FakeLngLat), expect.any(FakeLngLat)]);
    expect(polylineCalls[0].path.map((point) => point.lng)).toEqual([
      locatedFirst.lng,
      locatedSecond.lng,
    ]);
  });

  it("omits the polyline when route legs are null", async () => {
    installAmapGlobal();

    await renderTripMap(tripWithoutRoute);

    await waitFor(() => expect(mapCalls).toHaveLength(1));
    expect(markerCalls).toHaveLength(2);
    expect(polylineCalls).toHaveLength(0);
  });

  it("injects the amap script with the browser key and maps once it loads", async () => {
    const appendSpy = vi.spyOn(document.head, "appendChild");

    await renderTripMap(tripWithRoute);

    const script = appendSpy.mock.calls[0]?.[0] as HTMLScriptElement;
    expect(script.tagName).toBe("SCRIPT");
    expect(script.src).toContain("https://webapi.amap.com/maps?v=2.0&key=browser-key");
    expect(mapCalls).toHaveLength(0);

    installAmapGlobal();
    script.dispatchEvent(new Event("load"));

    await waitFor(() => expect(mapCalls).toHaveLength(1));
    expect(markerCalls).toHaveLength(2);
  });

  it("removes the map area silently when the script fails to load", async () => {
    const appendSpy = vi.spyOn(document.head, "appendChild");

    await renderTripMap(tripWithRoute);
    const script = appendSpy.mock.calls[0]?.[0] as HTMLScriptElement;

    script.dispatchEvent(new Event("error"));

    await waitFor(() => expect(screen.queryByTestId("trip-map")).toBeNull());
    expect(mapCalls).toHaveLength(0);
  });

  it("destroys the map instance on unmount", async () => {
    installAmapGlobal();

    await renderTripMap(tripWithRoute);
    await waitFor(() => expect(mapCalls).toHaveLength(1));

    cleanup();

    expect(destroyedMaps).toBe(1);
  });
});

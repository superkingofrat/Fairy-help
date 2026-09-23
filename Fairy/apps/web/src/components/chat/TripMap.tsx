import { useEffect, useRef, useState } from "react";
import type { TripPoi, TripResult } from "@fairy/shared";

// FU-19 二期：行程地图叠加层。用浏览器端高德 JS API（v=2.0）在行程卡片内渲染 POI  Marker 与路线折线。
// 密钥只走 build-time 环境变量 VITE_AMAP_JS_KEY（防盗链浏览器安全密钥），服务端 AMAP_SERVER_KEY
// 不得出现在任何前端产物。三种降级——未配置浏览器 key、无坐标 POI、脚本加载失败——全部静默：
// 不渲染地图区域、不向用户暴露错误，文字行程与核实徽标不受影响。
// 零 npm 依赖：动态注入 script + window.AMap 全局，不引入 @amap/amap-jsapi-loader 之类单一用途依赖。

interface AmapLngLat {
  lng: number;
  lat: number;
}

interface AmapMapInstance {
  setFitView(): void;
  destroy(): void;
}

interface AmapMarkerInstance {
  setMap(map: AmapMapInstance | null): void;
}

interface AmapPolylineInstance {
  setMap(map: AmapMapInstance | null): void;
}

// 只声明本组件真正消费的高德 JS API 2.0 表面，避免 any
interface AmapNamespace {
  // 高德 2.0 的坐标只认 LngLat 实例：裸 {lng,lat} 对象会被静默归一成 NaN，
  // 直到覆盖物构造时才以 Pixel(NaN,NaN) 抛出，被本组件的静默降级吞掉——地图整块消失
  LngLat: new (lng: number, lat: number) => AmapLngLat;
  Map: new (
    container: HTMLElement,
    options: { zoom: number; center: AmapLngLat },
  ) => AmapMapInstance;
  Marker: new (options: {
    position: AmapLngLat;
    title: string;
    map: AmapMapInstance;
  }) => AmapMarkerInstance;
  Polyline: new (options: { path: AmapLngLat[]; map: AmapMapInstance }) => AmapPolylineInstance;
}

declare global {
  interface Window {
    AMap?: AmapNamespace;
  }
}

let amapLoader: Promise<AmapNamespace | null> | null = null;

// 每次调用都读 env（而非模块级常量）：vitest 可在用例间 stubEnv；生产 build 时同样只求值一次语义
function amapBrowserKey(): string | null {
  const key = import.meta.env.VITE_AMAP_JS_KEY;
  return typeof key === "string" && key.length > 0 ? key : null;
}

function injectAmapScript(key: string): Promise<AmapNamespace> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`;
    script.async = true;
    script.addEventListener("load", () => {
      if (window.AMap) {
        resolve(window.AMap);
      } else {
        reject(new Error("Amap script loaded without the AMap global"));
      }
    });
    script.addEventListener("error", () => {
      reject(new Error("Amap script failed to load"));
    });
    document.head.appendChild(script);
  });
}

// 单例 Promise：去重并发加载；失败同样缓存，避免重复注入的风暴
function loadAmap(): Promise<AmapNamespace | null> {
  const key = amapBrowserKey();
  if (!key || typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }
  amapLoader ??= injectAmapScript(key);
  return amapLoader;
}

interface LocatedPoi {
  poi: TripPoi;
  location: AmapLngLat;
}

// 折线点推导：按行程顺序取有坐标 POI——route leg 只有 from/to 名称，坐标必须回到 itinerary 找；
// 部分 POI 无坐标时该段自然断开（只连相邻有坐标点）
function locatedPois(trip: TripResult): LocatedPoi[] {
  return trip.itinerary
    .flatMap((day) => day.steps)
    .filter((poi): poi is TripPoi & { location: AmapLngLat } => poi.location !== null)
    .map((poi) => ({ poi, location: poi.location }));
}

interface CreatedOverlay {
  destroy(): void;
}

function createOverlay(
  namespace: AmapNamespace,
  container: HTMLElement,
  trip: TripResult,
  points: LocatedPoi[],
): CreatedOverlay {
  const toLngLat = (location: AmapLngLat): AmapLngLat =>
    new namespace.LngLat(location.lng, location.lat);
  const map = new namespace.Map(container, {
    zoom: 11,
    center: toLngLat(points[0].location),
  });
  const markers = points.map(
    (point) =>
      new namespace.Marker({
        position: toLngLat(point.location),
        title: point.poi.name,
        map,
      }),
  );
  // route 非空才画折线（无校验路线的行程 route 为 null）
  const polyline =
    trip.route && trip.route.length > 0
      ? new namespace.Polyline({ path: points.map((point) => toLngLat(point.location)), map })
      : null;
  map.setFitView();

  return {
    destroy(): void {
      polyline?.setMap(null);
      markers.forEach((marker) => marker.setMap(null));
      map.destroy();
    },
  };
}

interface TripMapProps {
  trip: TripResult;
}

export function TripMap({ trip }: TripMapProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const key = amapBrowserKey();
    const points = locatedPois(trip);
    if (!key || points.length === 0) {
      return;
    }
    let disposed = false;
    let overlay: CreatedOverlay | null = null;
    loadAmap()
      .then((namespace) => {
        const container = containerRef.current;
        if (disposed || !namespace || !container) {
          return;
        }
        overlay = createOverlay(namespace, container, trip, points);
      })
      .catch(() => {
        // 脚本被拦截/企业网不通：静默撤掉地图区域，文字行程保持可读
        if (!disposed) {
          setFailed(true);
        }
      });
    return () => {
      disposed = true;
      overlay?.destroy();
    };
  }, [trip]);

  if (failed || amapBrowserKey() === null || locatedPois(trip).length === 0) {
    return null;
  }

  // 容器显式宽高走 Tailwind 工具类（§4：不为布局内联样式）；加载期间隐藏，避免空白地图区块闪现
  return (
    <div
      ref={containerRef}
      className="mt-2 h-48 w-full overflow-hidden rounded border border-sky-200"
      data-testid="trip-map"
    />
  );
}

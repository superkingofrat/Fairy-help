// FU-13：服务端高德 Web 服务 API 封装——POI 文本搜索 + 驾车路线规划。
// 密钥经 AMAP_SERVER_KEY 注入（仅服务端持有，永不到达前端）；
// 缺失/超时/报错一律返回 null（降级信号），不向调用链抛错，调用方据此降级。

const AMAP_BASE = "https://restapi.amap.com/v3";
const AMAP_TIMEOUT_MS = 8000;

export interface AmapPoiLocation {
  lng: number;
  lat: number;
}

export interface AmapPoi {
  name: string;
  location: AmapPoiLocation;
  adcode: string;
  category: string;
}

export interface AmapRouteMetrics {
  distanceMeters: number;
  durationSeconds: number;
}

function amapKey(): string | null {
  const key = process.env.AMAP_SERVER_KEY?.trim();
  return key ? key : null;
}

async function amapGet<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const key = amapKey();
  if (!key) {
    return null;
  }

  const url = new URL(`${AMAP_BASE}${path}`);
  url.search = new URLSearchParams({ key, output: "JSON", ...params }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AMAP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as { status?: string; info?: string } & T;
    // 高德业务失败（status 非 "1"）与网络失败同样视为不可用
    return json.status === "1" ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface PlaceTextResponse {
  pois?: Array<{
    name: string;
    location: string;
    adcode: string;
    type: string;
  }>;
}

export async function searchPoi(keyword: string, city?: string): Promise<AmapPoi | null> {
  const data = await amapGet<PlaceTextResponse>("/place/text", {
    keywords: keyword,
    ...(city ? { city, citylimit: "true" } : {}),
  });
  const poi = data?.pois?.[0];
  if (!poi) {
    return null;
  }
  const [lng, lat] = poi.location.split(",").map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return {
    name: poi.name,
    location: { lng, lat },
    adcode: poi.adcode,
    category: poi.type,
  };
}

interface DrivingResponse {
  route?: {
    paths?: Array<{
      distance: string;
      duration: string;
    }>;
  };
}

export async function planRoute(
  from: AmapPoiLocation,
  to: AmapPoiLocation
): Promise<AmapRouteMetrics | null> {
  const data = await amapGet<DrivingResponse>("/direction/driving", {
    origin: `${from.lng},${from.lat}`,
    destination: `${to.lng},${to.lat}`,
  });
  const path = data?.route?.paths?.[0];
  if (!path) {
    return null;
  }
  return {
    distanceMeters: Number(path.distance),
    durationSeconds: Number(path.duration),
  };
}

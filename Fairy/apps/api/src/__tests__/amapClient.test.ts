import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planRoute, searchPoi } from "../services/amapClient.js";

const originalKey = process.env.AMAP_SERVER_KEY;

describe("amapClient.searchPoi", () => {
  beforeEach(() => {
    process.env.AMAP_SERVER_KEY = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.AMAP_SERVER_KEY;
    } else {
      process.env.AMAP_SERVER_KEY = originalKey;
    }
    vi.unstubAllGlobals();
  });

  it("returns the first POI with a parsed location", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "1",
        pois: [{ name: "西湖", location: "120.15,30.25", adcode: "330106", type: "风景名胜" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const poi = await searchPoi("西湖", "杭州");

    expect(poi).toEqual({
      name: "西湖",
      location: { lng: 120.15, lat: 30.25 },
      adcode: "330106",
      category: "风景名胜",
    });
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/v3/place/text");
    expect(calledUrl.searchParams.get("key")).toBe("test-key");
    expect(calledUrl.searchParams.get("city")).toBe("杭州");
    expect(calledUrl.searchParams.get("citylimit")).toBe("true");
  });

  it("returns null when the key is missing", async () => {
    delete process.env.AMAP_SERVER_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const poi = await searchPoi("西湖", "杭州");

    expect(poi).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when no POI matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "1", pois: [] }),
      }),
    );

    expect(await searchPoi("不存在的地方", "杭州")).toBeNull();
  });

  it("returns null when Amap reports a business failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "0", info: "INVALID_USER_KEY" }),
      }),
    );

    expect(await searchPoi("西湖", "杭州")).toBeNull();
  });

  it("returns null on network error or non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await searchPoi("西湖", "杭州")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await searchPoi("西湖", "杭州")).toBeNull();
  });

  it("returns null on a malformed location", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "1",
          pois: [{ name: "西湖", location: "not-a-coordinate", adcode: "330106", type: "x" }],
        }),
      }),
    );

    expect(await searchPoi("西湖", "杭州")).toBeNull();
  });
});

describe("amapClient.planRoute", () => {
  beforeEach(() => {
    process.env.AMAP_SERVER_KEY = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.AMAP_SERVER_KEY;
    } else {
      process.env.AMAP_SERVER_KEY = originalKey;
    }
    vi.unstubAllGlobals();
  });

  it("returns distance and duration from the first path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "1",
          route: { paths: [{ distance: "6500", duration: "1200" }] },
        }),
      }),
    );

    const metrics = await planRoute({ lng: 120.15, lat: 30.25 }, { lng: 120.1, lat: 30.24 });

    expect(metrics).toEqual({ distanceMeters: 6500, durationSeconds: 1200 });
  });

  it("returns null when no path is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "1", route: {} }) }),
    );

    expect(await planRoute({ lng: 120.15, lat: 30.25 }, { lng: 120.1, lat: 30.24 })).toBeNull();
  });
});

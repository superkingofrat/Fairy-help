import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrip, getTrip, listTrips } from "../lib/tripApi";
import { useAuthStore } from "../stores/authStore";
import type { TripDetail, TripListFeed, TripResult } from "@fairy/shared";

// FU-19 二期：/trips 客户端。信封解包、查询串、错误码原样抛出（由 errorMessages 本地化）。

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const tripResult: TripResult = {
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
          location: { lng: 120.15, lat: 30.25 },
          validated: true,
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
          location: null,
          validated: false,
        },
      ],
    },
  ],
  route: null,
  validated: true,
};

const feed: TripListFeed = {
  items: [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      destination: "杭州",
      days: 2,
      validated: true,
      createdAt: "2026-09-20T10:00:00.000Z",
    },
  ],
  pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
};

describe("tripApi", () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: "token-1",
      refreshToken: null,
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "agent@fairy.local",
        role: "agent",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ token: null, refreshToken: null, user: null });
  });

  it("lists trips with the pagination query and bearer token", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(200, { code: "OK", data: feed, msg: "查询成功" }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listTrips({ page: 2, limit: 10 });

    expect(result.pagination.totalPages).toBe(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/trips?page=2&limit=10");
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-1");
  });

  it("posts a create request with the destination and days", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(201, { code: "OK", data: tripResult, msg: "行程已创建" }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTrip({ destination: "杭州", days: 2 });

    expect(result.destination).toBe("杭州");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ destination: "杭州", days: 2 });
  });

  it("fetches a trip detail by id", async () => {
    const detail: TripDetail = { ...tripResult, createdAt: "2026-09-20T10:00:00.000Z" };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(200, { code: "OK", data: detail, msg: "查询成功" }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTrip("trip-42");

    expect(result.createdAt).toBe("2026-09-20T10:00:00.000Z");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/trips/trip-42");
  });

  it("surfaces the create rejection code for localization", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse(403, {
            code: "TRIP_FORBIDDEN",
            data: null,
            msg: "无权创建行程",
          }) as Response,
      ),
    );

    await expect(createTrip({ destination: "杭州" })).rejects.toMatchObject({
      code: "TRIP_FORBIDDEN",
      message: "无权创建行程",
    });
  });

  it("surfaces the draft failure code as a 502 rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse(502, {
            code: "TRIP_DRAFT_FAILED",
            data: null,
            msg: "行程生成失败，请稍后再试",
          }) as Response,
      ),
    );

    await expect(createTrip({ destination: "杭州" })).rejects.toMatchObject({
      code: "TRIP_DRAFT_FAILED",
    });
  });
});

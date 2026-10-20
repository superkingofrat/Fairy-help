import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import * as authService from "../services/authService";
import * as tripService from "../services/tripService";
import { DEV_ADMIN_ID, DEV_USER_ID, type TripDetail } from "@fairy/shared";
import { authHeader } from "./helpers/auth";

vi.mock("../services/tripService");
vi.mock("../services/authService");

const TRIP_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";

const tripResultFixture = {
  tripId: TRIP_ID,
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
          note: null,
          location: { lng: 120.15, lat: 30.25 },
          validated: true,
        },
      ],
    },
  ],
  route: null,
  validated: true,
  companion: null,
};

const tripDetailFixture: TripDetail = {
  ...tripResultFixture,
  createdAt: "2026-09-22T10:00:00.000Z",
};

describe("POST /api/trips", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a trip for the agent role through the shared planning pipeline", async () => {
    vi.mocked(tripService.createTrip).mockResolvedValue({ ok: true, trip: tripResultFixture });

    const response = await request(app)
      .post("/api/trips")
      .set("Authorization", authHeader("agent"))
      .send({ destination: "杭州", days: 2 });

    expect(response.status).toBe(201);
    expect(response.body.code).toBe("OK");
    expect(response.body.data).toMatchObject({ tripId: TRIP_ID, destination: "杭州" });
    expect(tripService.createTrip).toHaveBeenCalledWith(DEV_USER_ID, {
      destination: "杭州",
      days: 2,
    });
  });

  it("creates a trip for admin without days", async () => {
    vi.mocked(tripService.createTrip).mockResolvedValue({ ok: true, trip: tripResultFixture });

    const response = await request(app)
      .post("/api/trips")
      .set("Authorization", authHeader("admin"))
      .send({ destination: "杭州" });

    expect(response.status).toBe(201);
    expect(tripService.createTrip).toHaveBeenCalledWith(DEV_ADMIN_ID, { destination: "杭州" });
  });

  it("returns the companion snapshot the planning pipeline resolved", async () => {
    vi.mocked(tripService.createTrip).mockResolvedValue({
      ok: true,
      trip: {
        ...tripResultFixture,
        companion: { name: "莱卡恩", userId: "00000000-0000-4000-8000-0000000000c1" },
      },
    });

    const response = await request(app)
      .post("/api/trips")
      .set("Authorization", authHeader("agent"))
      .send({ destination: "泉州", days: 2 });

    expect(response.status).toBe(201);
    expect(response.body.data.companion).toEqual({
      name: "莱卡恩",
      userId: "00000000-0000-4000-8000-0000000000c1",
    });
  });

  it("rejects the user role with 403 before any planning happens", async () => {
    const response = await request(app)
      .post("/api/trips")
      .set("Authorization", authHeader("user"))
      .send({ destination: "杭州" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("TRIP_FORBIDDEN");
    expect(tripService.createTrip).not.toHaveBeenCalled();
  });

  it("rejects a missing or invalid destination with 400", async () => {
    const missing = await request(app)
      .post("/api/trips")
      .set("Authorization", authHeader("agent"))
      .send({});
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("VALIDATION_ERROR");

    const badDays = await request(app)
      .post("/api/trips")
      .set("Authorization", authHeader("agent"))
      .send({ destination: "杭州", days: 0 });
    expect(badDays.status).toBe(400);
    expect(tripService.createTrip).not.toHaveBeenCalled();
  });

  it("maps unresolved drafts to 400 TRIP_UNRESOLVED and draft failures to 502", async () => {
    vi.mocked(tripService.createTrip).mockResolvedValue({ ok: false, code: "TRIP_UNRESOLVED" });
    const unresolved = await request(app)
      .post("/api/trips")
      .set("Authorization", authHeader("agent"))
      .send({ destination: "杭州" });
    expect(unresolved.status).toBe(400);
    expect(unresolved.body.code).toBe("TRIP_UNRESOLVED");

    vi.mocked(tripService.createTrip).mockResolvedValue({ ok: false, code: "TRIP_DRAFT_FAILED" });
    const failed = await request(app)
      .post("/api/trips")
      .set("Authorization", authHeader("agent"))
      .send({ destination: "杭州" });
    expect(failed.status).toBe(502);
    expect(failed.body.code).toBe("TRIP_DRAFT_FAILED");
  });

  it("rejects anonymous requests with 401", async () => {
    const response = await request(app).post("/api/trips").send({ destination: "杭州" });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/trips", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the caller's trips newest first with pagination", async () => {
    vi.mocked(tripService.listTrips).mockResolvedValue({
      items: [
        {
          id: TRIP_ID,
          destination: "杭州",
          days: 2,
          validated: true,
          createdAt: "2026-09-22T10:00:00.000Z",
        },
      ],
      total: 1,
    });

    const response = await request(app).get("/api/trips").set("Authorization", authHeader("agent"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data.items[0]).toMatchObject({ destination: "杭州", validated: true });
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(tripService.listTrips).toHaveBeenCalledWith(
      DEV_USER_ID,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it("lets admin list another user's trips", async () => {
    vi.mocked(authService.getUserById).mockResolvedValue({
      id: OTHER_USER_ID,
      email: "other@fairy.local",
      role: "user",
    });
    vi.mocked(tripService.listTrips).mockResolvedValue({ items: [], total: 0 });

    const response = await request(app)
      .get("/api/trips")
      .query({ userId: OTHER_USER_ID })
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(tripService.listTrips).toHaveBeenCalledWith(
      OTHER_USER_ID,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it("forbids non-admin userId lookups", async () => {
    const response = await request(app)
      .get("/api/trips")
      .query({ userId: OTHER_USER_ID })
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(tripService.listTrips).not.toHaveBeenCalled();
  });

  it("rejects an invalid userId with 400 and an unknown one with 404", async () => {
    vi.mocked(authService.getUserById).mockResolvedValue(null);

    const invalid = await request(app)
      .get("/api/trips")
      .query({ userId: "not-a-uuid" })
      .set("Authorization", authHeader("admin"));
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("INVALID_USER_ID");

    const unknown = await request(app)
      .get("/api/trips")
      .query({ userId: OTHER_USER_ID })
      .set("Authorization", authHeader("admin"));
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("USER_NOT_FOUND");
    expect(tripService.listTrips).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests with 401", async () => {
    const response = await request(app).get("/api/trips");
    expect(response.status).toBe(401);
  });
});

describe("GET /api/trips/:id", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the owner's trip detail", async () => {
    vi.mocked(tripService.getTripDetail).mockResolvedValue({
      trip: tripDetailFixture,
      ownerId: DEV_USER_ID,
    });

    const response = await request(app)
      .get(`/api/trips/${TRIP_ID}`)
      .set("Authorization", authHeader("agent"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data).toMatchObject({
      tripId: TRIP_ID,
      createdAt: "2026-09-22T10:00:00.000Z",
    });
  });

  it("returns the persisted companion snapshot on the detail", async () => {
    vi.mocked(tripService.getTripDetail).mockResolvedValue({
      trip: {
        ...tripDetailFixture,
        companion: { name: "莱卡恩", userId: "00000000-0000-4000-8000-0000000000c1" },
      },
      ownerId: DEV_USER_ID,
    });

    const response = await request(app)
      .get(`/api/trips/${TRIP_ID}`)
      .set("Authorization", authHeader("agent"));

    expect(response.status).toBe(200);
    expect(response.body.data.companion).toEqual({
      name: "莱卡恩",
      userId: "00000000-0000-4000-8000-0000000000c1",
    });
  });

  it("returns 404 for another user's trip without leaking existence", async () => {
    vi.mocked(tripService.getTripDetail).mockResolvedValue({
      trip: tripDetailFixture,
      ownerId: OTHER_USER_ID,
    });

    const response = await request(app)
      .get(`/api/trips/${TRIP_ID}`)
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("TRIP_NOT_FOUND");
  });

  it("returns 404 for an unknown id", async () => {
    vi.mocked(tripService.getTripDetail).mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/trips/${TRIP_ID}`)
      .set("Authorization", authHeader("agent"));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("TRIP_NOT_FOUND");
  });

  it("lets admin read any trip detail", async () => {
    vi.mocked(tripService.getTripDetail).mockResolvedValue({
      trip: tripDetailFixture,
      ownerId: OTHER_USER_ID,
    });

    const response = await request(app)
      .get(`/api/trips/${TRIP_ID}`)
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
  });

  it("rejects anonymous requests with 401", async () => {
    const response = await request(app).get(`/api/trips/${TRIP_ID}`);
    expect(response.status).toBe(401);
  });
});

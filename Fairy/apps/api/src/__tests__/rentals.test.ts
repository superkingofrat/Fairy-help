import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import * as authService from "../services/authService";
import * as rentalService from "../services/rentalService";
import { authHeader } from "./helpers/auth";
import { DEV_USER_ID } from "@fairy/shared";

vi.mock("../services/rentalService");
vi.mock("../services/authService");

const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";

describe("GET /api/rentals", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the caller's own rentals with movie title", async () => {
    vi.mocked(rentalService.listRentals).mockResolvedValue([
      {
        rentalId: "r2",
        movieId: MOVIE_ID,
        movieTitle: "盗梦空间",
        status: "ACTIVE",
        borrowedAt: "2026-08-30T00:00:00.000Z",
        returnedAt: null,
      },
    ]);

    const response = await request(app)
      .get("/api/rentals")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data).toEqual([
      {
        rentalId: "r2",
        movieId: MOVIE_ID,
        movieTitle: "盗梦空间",
        status: "ACTIVE",
        borrowedAt: "2026-08-30T00:00:00.000Z",
        returnedAt: null,
      },
    ]);
    expect(rentalService.listRentals).toHaveBeenCalledWith(DEV_USER_ID, {});
  });

  it("passes the ACTIVE status filter through", async () => {
    vi.mocked(rentalService.listRentals).mockResolvedValue([]);

    const response = await request(app)
      .get("/api/rentals?status=ACTIVE")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(200);
    expect(rentalService.listRentals).toHaveBeenCalledWith(DEV_USER_ID, {
      status: "ACTIVE",
    });
  });

  it("rejects an unsupported status value with 400", async () => {
    const response = await request(app)
      .get("/api/rentals?status=RETURNED")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(rentalService.listRentals).not.toHaveBeenCalled();
  });

  it("allows an admin to query another user's rentals", async () => {
    vi.mocked(authService.getUserById).mockResolvedValue({
      id: OTHER_USER_ID,
      email: "other@fairy.local",
      role: "user",
    });
    vi.mocked(rentalService.listRentals).mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/rentals?userId=${OTHER_USER_ID}`)
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(rentalService.listRentals).toHaveBeenCalledWith(OTHER_USER_ID, {});
  });

  it("returns 404 USER_NOT_FOUND for a missing target user", async () => {
    vi.mocked(authService.getUserById).mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/rentals?userId=${OTHER_USER_ID}`)
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("USER_NOT_FOUND");
    expect(rentalService.listRentals).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_USER_ID for a non-uuid userId", async () => {
    const response = await request(app)
      .get("/api/rentals?userId=not-a-uuid")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_USER_ID");
  });

  it("returns 403 when a user queries another user", async () => {
    const response = await request(app)
      .get(`/api/rentals?userId=${OTHER_USER_ID}`)
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(rentalService.listRentals).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).get("/api/rentals");

    expect(response.status).toBe(401);
    expect(rentalService.listRentals).not.toHaveBeenCalled();
  });
});

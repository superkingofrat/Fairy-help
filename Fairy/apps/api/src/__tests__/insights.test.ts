import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { getStoreInsightsOverview } from "../services/insightService.js";
import { authHeader } from "./helpers/auth.js";

vi.mock("../services/insightService.js");

const overviewFixture = {
  popularMovies: [
    {
      movieId: "m1",
      title: "海蒂",
      borrowCount: 3,
      recommendCount: 3,
      inStock: true,
    },
  ],
  trend: [
    { date: "2026-08-30", borrowCount: 1, returnCount: 0 },
    { date: "2026-08-31", borrowCount: 0, returnCount: 1 },
  ],
  inventory: {
    activeRentals: 2,
    borrowedRatio: 0.4,
    lowStockMovies: [{ movieId: "m2", title: "楚门的世界", stock: 0, totalStock: 2 }],
  },
  moods: [{ value: "治愈", count: 3 }],
  scenes: [{ value: "雨天", count: 2 }],
  activity: { totalUsers: 4, activeUsers7d: 2, newUsers7d: 1 },
};

describe("GET /api/insights/overview", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStoreInsightsOverview).mockResolvedValue(overviewFixture as never);
  });

  it("returns the overview for an admin", async () => {
    const response = await request(app)
      .get("/api/insights/overview")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data).toEqual(overviewFixture);
  });

  it("returns 403 FORBIDDEN for a user-role account", async () => {
    const response = await request(app)
      .get("/api/insights/overview")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(getStoreInsightsOverview).not.toHaveBeenCalled();
  });

  it("returns 401 UNAUTHORIZED without a token", async () => {
    const response = await request(app).get("/api/insights/overview");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
    expect(getStoreInsightsOverview).not.toHaveBeenCalled();
  });
});

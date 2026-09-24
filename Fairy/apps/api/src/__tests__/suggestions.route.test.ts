import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import * as suggestionService from "../services/suggestionService";
import type { Suggestion } from "@fairy/shared";
import { authHeader } from "./helpers/auth";

vi.mock("../services/suggestionService");

const SUGGESTION_ID = "550e8400-e29b-41d4-a716-446655440000";

const suggestionFixture: Suggestion = {
  id: SUGGESTION_ID,
  kind: "LOW_STOCK",
  summary: "《教父》库存告急",
  body: "目前仅剩 0 盒在库，建议尽快补货。",
  sourceData: { movieId: "m1", title: "教父", stock: 0, totalStock: 2 },
  readAt: null,
  createdAt: "2026-09-23T04:00:00.000Z",
};

describe("GET /api/suggestions", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the newest-first feed under the standard envelope for admin", async () => {
    vi.mocked(suggestionService.listSuggestions).mockResolvedValue({
      items: [suggestionFixture],
      total: 1,
    });

    const response = await request(app)
      .get("/api/suggestions")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data).toMatchObject({
      items: [suggestionFixture],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(suggestionService.listSuggestions).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("applies pagination query parameters", async () => {
    vi.mocked(suggestionService.listSuggestions).mockResolvedValue({ items: [], total: 40 });

    const response = await request(app)
      .get("/api/suggestions?page=3&limit=10")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toMatchObject({ page: 3, limit: 10, totalPages: 4 });
    expect(suggestionService.listSuggestions).toHaveBeenCalledWith({ page: 3, limit: 10 });
  });

  it("rejects anonymous requests with 401", async () => {
    const response = await request(app).get("/api/suggestions");

    expect(response.status).toBe(401);
    expect(suggestionService.listSuggestions).not.toHaveBeenCalled();
  });
});

describe("GET /api/suggestions/unread-count", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the unread count for admin", async () => {
    vi.mocked(suggestionService.getUnreadCount).mockResolvedValue(3);

    const response = await request(app)
      .get("/api/suggestions/unread-count")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ count: 3 });
  });

  it("rejects anonymous requests with 401", async () => {
    const response = await request(app).get("/api/suggestions/unread-count");

    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/suggestions/:id/read", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a suggestion read for admin", async () => {
    vi.mocked(suggestionService.markRead).mockResolvedValue({
      ...suggestionFixture,
      readAt: "2026-09-23T06:00:00.000Z",
    });

    const response = await request(app)
      .patch(`/api/suggestions/${SUGGESTION_ID}/read`)
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data.readAt).toBe("2026-09-23T06:00:00.000Z");
    expect(suggestionService.markRead).toHaveBeenCalledWith(SUGGESTION_ID);
  });

  it("returns 404 SUGGESTION_NOT_FOUND for an unknown id", async () => {
    vi.mocked(suggestionService.markRead).mockResolvedValue(null);

    const response = await request(app)
      .patch("/api/suggestions/does-not-exist/read")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("SUGGESTION_NOT_FOUND");
    expect(response.body.data).toBeNull();
  });

  it("rejects anonymous requests with 401", async () => {
    const response = await request(app).patch(`/api/suggestions/${SUGGESTION_ID}/read`);

    expect(response.status).toBe(401);
  });
});

describe("POST /api/suggestions/generate-daily", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates (or reuses) the day's report for admin", async () => {
    vi.mocked(suggestionService.generateDailyReport).mockResolvedValue({
      ...suggestionFixture,
      kind: "DAILY_REPORT",
      summary: "经营日报 · 2026-09-23",
    });

    const first = await request(app)
      .post("/api/suggestions/generate-daily")
      .set("Authorization", authHeader("admin"));

    expect(first.status).toBe(200);
    expect(first.body.data.kind).toBe("DAILY_REPORT");
    expect(suggestionService.generateDailyReport).toHaveBeenCalledTimes(1);
  });

  it("rejects anonymous requests with 401", async () => {
    const response = await request(app).post("/api/suggestions/generate-daily");

    expect(response.status).toBe(401);
  });
});

describe("role gate on all suggestion endpoints", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(suggestionService.listSuggestions).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(suggestionService.getUnreadCount).mockResolvedValue(0);
    vi.mocked(suggestionService.markRead).mockResolvedValue(suggestionFixture);
    vi.mocked(suggestionService.generateDailyReport).mockResolvedValue(suggestionFixture);
  });

  it("denies the user role with 403 FORBIDDEN on every endpoint", async () => {
    const asUser = authHeader("user");
    const responses = await Promise.all([
      request(app).get("/api/suggestions").set("Authorization", asUser),
      request(app).get("/api/suggestions/unread-count").set("Authorization", asUser),
      request(app).patch(`/api/suggestions/${SUGGESTION_ID}/read`).set("Authorization", asUser),
      request(app).post("/api/suggestions/generate-daily").set("Authorization", asUser),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
      expect(response.body.data).toBeNull();
    }
    expect(suggestionService.listSuggestions).not.toHaveBeenCalled();
    expect(suggestionService.getUnreadCount).not.toHaveBeenCalled();
    expect(suggestionService.markRead).not.toHaveBeenCalled();
    expect(suggestionService.generateDailyReport).not.toHaveBeenCalled();
  });
});

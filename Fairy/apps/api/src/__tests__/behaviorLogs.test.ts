import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import * as behaviorLogService from "../services/behaviorLogService";
import type { BehaviorLogListItem } from "@fairy/shared";
import { authHeader } from "./helpers/auth";

vi.mock("../services/behaviorLogService");

const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";

function sampleItem(overrides: Partial<BehaviorLogListItem> = {}): BehaviorLogListItem {
  return {
    id: "990e8400-e29b-41d4-a716-446655440000",
    userId: DEV_USER_ID,
    email: "user@fairy.local",
    action: "BORROW_SUCCESS",
    movieId: MOVIE_ID,
    movieTitle: "星际穿越",
    rentalId: "880e8400-e29b-41d4-a716-446655440000",
    recommendCount: null,
    createdAt: "2026-08-29T08:00:00.000Z",
    ...overrides,
  };
}

describe("behavior-logs routes", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when user role lists behavior logs", async () => {
    const response = await request(app)
      .get("/api/behavior-logs")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(behaviorLogService.listLogs).not.toHaveBeenCalled();
  });

  it("lists a resolved feed for admin", async () => {
    vi.mocked(behaviorLogService.listLogs).mockResolvedValue({
      items: [sampleItem()],
      total: 1,
    });

    const response = await request(app)
      .get("/api/behavior-logs")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      email: "user@fairy.local",
      movieTitle: "星际穿越",
      rentalId: "880e8400-e29b-41d4-a716-446655440000",
    });
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns an empty feed when there are no logs", async () => {
    vi.mocked(behaviorLogService.listLogs).mockResolvedValue({ items: [], total: 0 });

    const response = await request(app)
      .get("/api/behavior-logs")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([]);
    expect(response.body.data.pagination.totalPages).toBe(0);
  });

  it("passes the action filter to the service", async () => {
    vi.mocked(behaviorLogService.listLogs).mockResolvedValue({ items: [], total: 0 });

    const response = await request(app)
      .get("/api/behavior-logs?action=RECOMMEND&page=2&limit=5")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(behaviorLogService.listLogs).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      action: "RECOMMEND",
    });
  });

  it("returns 400 for an unknown action", async () => {
    const response = await request(app)
      .get("/api/behavior-logs?action=HACKED")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(behaviorLogService.listLogs).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_USER_ID for a non-uuid userId", async () => {
    const response = await request(app)
      .get("/api/behavior-logs?userId=not-a-uuid")
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_USER_ID");
    expect(behaviorLogService.listLogs).not.toHaveBeenCalled();
  });

  it("passes a valid userId filter to the service", async () => {
    vi.mocked(behaviorLogService.listLogs).mockResolvedValue({ items: [], total: 0 });

    const response = await request(app)
      .get(`/api/behavior-logs?userId=${DEV_USER_ID}`)
      .set("Authorization", authHeader("admin"));

    expect(response.status).toBe(200);
    expect(behaviorLogService.listLogs).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      userId: DEV_USER_ID,
    });
  });

  it("does not offer mutation routes (append-only)", async () => {
    const deleteResponse = await request(app)
      .delete("/api/behavior-logs/990e8400-e29b-41d4-a716-446655440000")
      .set("Authorization", authHeader("admin"));
    const patchResponse = await request(app)
      .patch("/api/behavior-logs/990e8400-e29b-41d4-a716-446655440000")
      .set("Authorization", authHeader("admin"))
      .send({ action: "RECOMMEND" });

    expect(deleteResponse.status).toBe(404);
    expect(patchResponse.status).toBe(404);
  });
});

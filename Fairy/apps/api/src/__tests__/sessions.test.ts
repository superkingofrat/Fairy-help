import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import * as sessionService from "../services/sessionService.js";
import { authHeader } from "./helpers/auth.js";

vi.mock("../services/sessionService.js");

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

const sampleSession = {
  id: SESSION_ID,
  title: "雨天",
  messageCount: 1,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T09:00:00.000Z",
};

describe("/api/sessions", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sessionService.createSession).mockResolvedValue(sampleSession);
    vi.mocked(sessionService.listSessions).mockResolvedValue([sampleSession]);
    vi.mocked(sessionService.getSessionMessages).mockResolvedValue({ ok: true, messages: [] });
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/api/sessions");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("creates a session with 201 and the unified envelope", async () => {
    const response = await request(app)
      .post("/api/sessions")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      code: "OK",
      data: sampleSession,
      msg: "会话已创建",
    });
    expect(sessionService.createSession).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it("lists sessions for the authenticated user", async () => {
    const response = await request(app)
      .get("/api/sessions")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");
    expect(response.body.data).toEqual([sampleSession]);
  });

  it("returns messages for an owned session", async () => {
    vi.mocked(sessionService.getSessionMessages).mockResolvedValue({
      ok: true,
      messages: [
        {
          id: "770e8400-e29b-41d4-a716-446655440000",
          sessionId: SESSION_ID,
          role: "user",
          content: "雨天",
          payload: null,
          createdAt: "2026-09-01T09:00:00.000Z",
        },
      ],
    });

    const response = await request(app)
      .get(`/api/sessions/${SESSION_ID}`)
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].content).toBe("雨天");
  });

  it("returns 404 for an unknown session", async () => {
    vi.mocked(sessionService.getSessionMessages).mockResolvedValue({
      ok: false,
      code: "SESSION_NOT_FOUND",
    });

    const response = await request(app)
      .get(`/api/sessions/${SESSION_ID}`)
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "SESSION_NOT_FOUND",
      data: null,
      msg: "会话不存在",
    });
  });

  it("returns 403 for another user's session", async () => {
    vi.mocked(sessionService.getSessionMessages).mockResolvedValue({
      ok: false,
      code: "SESSION_FORBIDDEN",
    });

    const response = await request(app)
      .get(`/api/sessions/${SESSION_ID}`)
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("SESSION_FORBIDDEN");
  });

  it("returns 400 for a non-uuid session id", async () => {
    const response = await request(app)
      .get("/api/sessions/not-a-uuid")
      .set("Authorization", authHeader("user"));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(sessionService.getSessionMessages).not.toHaveBeenCalled();
  });
});

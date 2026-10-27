import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import * as memoryService from "../memory/memoryService.js";
import { DEV_ADMIN_ID, DEV_USER_ID } from "@fairy/shared";
import type { MemoryListItem, MemoryRecord } from "@fairy/shared";
import { authHeader } from "./helpers/auth.js";

vi.mock("../memory/memoryService.js");

const recordFixture: MemoryRecord = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  profileId: DEV_USER_ID,
  sessionId: null,
  kind: "preference",
  content: "喜欢科幻片",
  metadata: null,
  createdAt: "2026-09-01T10:00:00.000Z",
};

const listItemFixture: MemoryListItem = {
  id: recordFixture.id,
  userId: DEV_USER_ID,
  email: "user@fairy.local",
  kind: "preference",
  content: "喜欢科幻片",
  sessionId: null,
  createdAt: "2026-09-01T10:00:00.000Z",
};

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: DEV_USER_ID,
    kind: "preference",
    content: "喜欢科幻片",
    ...overrides,
  };
}

describe("memories routes", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/memories", () => {
    it("lists memories for admin with filters", async () => {
      vi.mocked(memoryService.listMemories).mockResolvedValue({
        items: [listItemFixture],
        total: 1,
      });

      const response = await request(app)
        .get("/api/memories")
        .set("Authorization", authHeader("admin"))
        .query({ page: 2, limit: 10, kind: "preference", keyword: "科幻", userId: DEV_USER_ID });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe("OK");
      expect(response.body.data.items[0]).toMatchObject({
        email: "user@fairy.local",
        kind: "preference",
      });
      expect(response.body.data.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(memoryService.listMemories).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        kind: "preference",
        keyword: "科幻",
        userId: DEV_USER_ID,
      });
    });

    it("rejects non-admin with 403 before calling the service", async () => {
      const response = await request(app)
        .get("/api/memories")
        .set("Authorization", authHeader("user"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
      expect(memoryService.listMemories).not.toHaveBeenCalled();
    });

    it("rejects anonymous with 401", async () => {
      const response = await request(app).get("/api/memories");

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("UNAUTHORIZED");
    });

    it("rejects an invalid kind filter with 400", async () => {
      const response = await request(app)
        .get("/api/memories")
        .set("Authorization", authHeader("admin"))
        .query({ kind: "wish" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(memoryService.listMemories).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/memories/me", () => {
    it("lists the user's own memories with defaults", async () => {
      vi.mocked(memoryService.listOwnMemories).mockResolvedValue({
        items: [],
        total: 0,
      });

      const response = await request(app)
        .get("/api/memories/me")
        .set("Authorization", authHeader("user"));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe("OK");
      expect(response.body.data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
      expect(memoryService.listOwnMemories).toHaveBeenCalledWith(DEV_USER_ID, {
        page: 1,
        limit: 20,
      });
    });

    it("applies kind/keyword filters and ignores a client-supplied userId", async () => {
      vi.mocked(memoryService.listOwnMemories).mockResolvedValue({
        items: [],
        total: 0,
      });

      const response = await request(app)
        .get("/api/memories/me")
        .set("Authorization", authHeader("user"))
        .query({
          page: 2,
          limit: 10,
          kind: "fact",
          keyword: "上海",
          userId: DEV_ADMIN_ID,
          email: "other@fairy.local",
        });

      expect(response.status).toBe(200);
      // 身份一律取 token 的 userId（DEV_USER_ID），userId/email 参数被 schema 剥除。
      expect(memoryService.listOwnMemories).toHaveBeenCalledWith(DEV_USER_ID, {
        page: 2,
        limit: 10,
        kind: "fact",
        keyword: "上海",
      });
    });

    it("lets an admin self-inspect using the admin's own id", async () => {
      vi.mocked(memoryService.listOwnMemories).mockResolvedValue({
        items: [],
        total: 0,
      });

      const response = await request(app)
        .get("/api/memories/me")
        .set("Authorization", authHeader("admin"));

      expect(response.status).toBe(200);
      expect(memoryService.listOwnMemories).toHaveBeenCalledWith(DEV_ADMIN_ID, {
        page: 1,
        limit: 20,
      });
    });

    it("rejects anonymous with 401 before calling the service", async () => {
      const response = await request(app).get("/api/memories/me");

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("UNAUTHORIZED");
      expect(memoryService.listOwnMemories).not.toHaveBeenCalled();
    });

    it("rejects an invalid kind filter with 400", async () => {
      const response = await request(app)
        .get("/api/memories/me")
        .set("Authorization", authHeader("user"))
        .query({ kind: "wish" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(memoryService.listOwnMemories).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/memories", () => {
    it("creates a memory for admin and returns 201", async () => {
      vi.mocked(memoryService.createMemory).mockResolvedValue({
        ok: true,
        record: recordFixture,
      });

      const response = await request(app)
        .post("/api/memories")
        .set("Authorization", authHeader("admin"))
        .send(createBody());

      expect(response.status).toBe(201);
      expect(response.body.code).toBe("OK");
      expect(response.body.data).toMatchObject({ content: "喜欢科幻片" });
      expect(memoryService.createMemory).toHaveBeenCalledWith(createBody());
    });

    it("returns 404 PROFILE_NOT_FOUND when the profile is missing", async () => {
      vi.mocked(memoryService.createMemory).mockResolvedValue({
        ok: false,
        code: "PROFILE_NOT_FOUND",
      });

      const response = await request(app)
        .post("/api/memories")
        .set("Authorization", authHeader("admin"))
        .send(createBody());

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("PROFILE_NOT_FOUND");
    });

    it("rejects a non-admin creator with 403", async () => {
      const response = await request(app)
        .post("/api/memories")
        .set("Authorization", authHeader("user"))
        .send(createBody());

      expect(response.status).toBe(403);
      expect(memoryService.createMemory).not.toHaveBeenCalled();
    });

    it("rejects an invalid body with 400", async () => {
      const response = await request(app)
        .post("/api/memories")
        .set("Authorization", authHeader("admin"))
        .send(createBody({ kind: "wish" }));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(memoryService.createMemory).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/memories/:id", () => {
    it("updates kind/content for admin", async () => {
      vi.mocked(memoryService.updateMemory).mockResolvedValue({
        ...recordFixture,
        kind: "intent",
        content: "想周末去杭州",
      });

      const response = await request(app)
        .patch("/api/memories/mem-1")
        .set("Authorization", authHeader("admin"))
        .send({ kind: "intent", content: "想周末去杭州" });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe("OK");
      expect(response.body.data).toMatchObject({ kind: "intent", content: "想周末去杭州" });
      expect(memoryService.updateMemory).toHaveBeenCalledWith("mem-1", {
        kind: "intent",
        content: "想周末去杭州",
      });
    });

    it("returns 404 MEMORY_NOT_FOUND for an unknown id", async () => {
      vi.mocked(memoryService.updateMemory).mockResolvedValue(null);

      const response = await request(app)
        .patch("/api/memories/missing")
        .set("Authorization", authHeader("admin"))
        .send({ content: "新内容" });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("MEMORY_NOT_FOUND");
    });

    it("rejects an empty patch body with 400", async () => {
      const response = await request(app)
        .patch("/api/memories/mem-1")
        .set("Authorization", authHeader("admin"))
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(memoryService.updateMemory).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/memories/:id", () => {
    it("deletes an existing memory for admin", async () => {
      vi.mocked(memoryService.deleteMemory).mockResolvedValue(true);

      const response = await request(app)
        .delete("/api/memories/mem-1")
        .set("Authorization", authHeader("admin"));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ code: "OK", data: { id: "mem-1" } });
      expect(memoryService.deleteMemory).toHaveBeenCalledWith("mem-1");
    });

    it("returns 404 MEMORY_NOT_FOUND for an unknown id", async () => {
      vi.mocked(memoryService.deleteMemory).mockResolvedValue(false);

      const response = await request(app)
        .delete("/api/memories/missing")
        .set("Authorization", authHeader("admin"));

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("MEMORY_NOT_FOUND");
    });

    it("rejects non-admin with 403", async () => {
      const response = await request(app)
        .delete("/api/memories/mem-1")
        .set("Authorization", authHeader("user"));

      expect(response.status).toBe(403);
      expect(memoryService.deleteMemory).not.toHaveBeenCalled();
    });
  });
});

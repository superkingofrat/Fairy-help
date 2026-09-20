import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { prisma } from "@fairy/database";
import * as profileService from "../services/profileService";
import { authHeader } from "./helpers/auth";
import { DEV_USER_ID } from "@fairy/shared";

vi.mock("@fairy/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("../services/profileService");

const seededUser = {
  id: DEV_USER_ID,
  email: "user@fairy.local",
  role: "user",
  passwordHash: bcrypt.hashSync("user123456", 10),
};

const activeRefreshRow = {
  id: "rt-1",
  tokenHash: "hash",
  userId: DEV_USER_ID,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  revokedAt: null,
};

describe("auth routes", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in with correct credentials and the token authenticates /me", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(seededUser as never);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: seededUser.email, password: "user123456" });

    expect(login.status).toBe(200);
    expect(login.body.code).toBe("OK");
    expect(login.body.data.user).toEqual({
      id: DEV_USER_ID,
      email: seededUser.email,
      role: "user",
    });
    expect(typeof login.body.data.token).toBe("string");
    expect(typeof login.body.data.refreshToken).toBe("string");
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: DEV_USER_ID }) })
    );

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.data.token}`);

    expect(me.status).toBe(200);
    expect(me.body.data).toEqual({ id: DEV_USER_ID, email: seededUser.email, role: "user" });
  });

  it("returns the same 401 body for wrong password and unknown email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(seededUser as never);
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: seededUser.email, password: "wrong-password" });

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@fairy.local", password: "whatever" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.code).toBe("UNAUTHORIZED");
  });

  it("rejects dev stub headers on business endpoints", async () => {
    const byHeader = await request(app).get("/api/movies").set("X-Dev-Role", "admin");
    const byDevToken = await request(app).get("/api/movies").set("Authorization", "Bearer dev-admin");

    expect(byHeader.status).toBe(401);
    expect(byHeader.body.code).toBe("UNAUTHORIZED");
    expect(byDevToken.status).toBe(401);
  });

  it("enforces the role boundary under JWT", async () => {
    vi.mocked(profileService.listUsersWithProfiles).mockResolvedValue([]);

    const asUser = await request(app).get("/api/profiles").set("Authorization", authHeader("user"));
    expect(asUser.status).toBe(403);
    expect(asUser.body.code).toBe("FORBIDDEN");

    const asAdmin = await request(app).get("/api/profiles").set("Authorization", authHeader("admin"));
    expect(asAdmin.status).toBe(200);
  });

  describe("register", () => {
    it("creates a user with role=user and returns token + refreshToken", async () => {
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "new-user-1",
        email: "new@fairy.local",
        role: "user",
      } as never);

      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "new@fairy.local", password: "secret123" });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe("OK");
      expect(res.body.data.user).toEqual({
        id: "new-user-1",
        email: "new@fairy.local",
        role: "user",
      });
      expect(typeof res.body.data.token).toBe("string");
      expect(typeof res.body.data.refreshToken).toBe("string");

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: "new@fairy.local", passwordHash: expect.any(String), role: "user" },
      });
      // 注册即建空白 Profile：name = 邮箱前缀
      expect(profileService.createForExistingUser).toHaveBeenCalledWith({
        userId: "new-user-1",
        name: "new",
        avatarUrl: null,
        styleTags: [],
        likeGenres: [],
        avoidFood: [],
        dietPreference: null,
        travelStyle: null,
      });
    });

    it("creates a blank profile on register but does not fail register if profile creation throws", async () => {
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "new-user-2",
        email: "fail@fairy.local",
        role: "user",
      } as never);
      vi.mocked(profileService.createForExistingUser).mockRejectedValue(new Error("profile boom"));

      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "fail@fairy.local", password: "secret123" });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe("OK");
      expect(profileService.createForExistingUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "new-user-2" })
      );
    });

    it("does not create a profile when registration is rejected (duplicate email)", async () => {
      const p2002 = Object.assign(new Error("unique constraint"), { code: "P2002" });
      vi.mocked(prisma.user.create).mockRejectedValue(p2002 as never);

      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "dup@fairy.local", password: "secret123" });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("EMAIL_ALREADY_EXISTS");
      expect(profileService.createForExistingUser).not.toHaveBeenCalled();
    });

    it("rejects invalid payloads with 400 VALIDATION_ERROR", async () => {
      const badEmail = await request(app)
        .post("/api/auth/register")
        .send({ email: "not-an-email", password: "secret123" });
      const shortPassword = await request(app)
        .post("/api/auth/register")
        .send({ email: "ok@fairy.local", password: "123" });

      expect(badEmail.status).toBe(400);
      expect(shortPassword.status).toBe(400);
      expect(badEmail.body.code).toBe("VALIDATION_ERROR");
      expect(shortPassword.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("refresh token rotation", () => {
    it("rotates a valid refresh token and revokes the old one", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(activeRefreshRow as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(seededUser as never);

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: "the-raw-token" });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe("OK");
      expect(typeof res.body.data.token).toBe("string");
      expect(typeof res.body.data.refreshToken).toBe("string");
      expect(res.body.data.user).toEqual({ id: DEV_USER_ID, email: seededUser.email, role: "user" });

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: "rt-1" },
        data: { revokedAt: expect.any(Date), replacedByTokenId: expect.any(String) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it("rejects a reused (already revoked) token and revokes the whole family", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
        ...activeRefreshRow,
        revokedAt: new Date(),
      } as never);

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: "reused-token" });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: DEV_USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("rejects an expired refresh token without touching the row", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
        ...activeRefreshRow,
        expiresAt: new Date(Date.now() - 1000),
      } as never);

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: "expired-token" });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("rejects an unknown token with 401", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: "ghost-token" });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
    });
  });

  describe("logout", () => {
    it("revokes the presented refresh token", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(activeRefreshRow as never);

      const res = await request(app)
        .post("/api/auth/logout")
        .send({ refreshToken: "the-raw-token" });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe("OK");
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: "rt-1" },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("is idempotent for an unknown token", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post("/api/auth/logout")
        .send({ refreshToken: "ghost-token" });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe("OK");
    });
  });

  describe("rate limiting", () => {
    it("returns 429 on the 11th login attempt from the same IP", async () => {
      // 独立 app 实例：限流器在 createApp() 内创建，避免消耗其他用例的配额
      const freshApp = createApp();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(seededUser as never);

      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await request(freshApp)
          .post("/api/auth/login")
          .send({ email: seededUser.email, password: "user123456" });
        statuses.push(res.status);
      }

      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
      expect((await request(freshApp).get("/health")).status).toBe(200);
    });
  });
});

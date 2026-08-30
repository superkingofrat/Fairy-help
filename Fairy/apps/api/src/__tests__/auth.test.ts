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
    },
  },
}));
vi.mock("../services/profileService");

const seededUser = {
  id: DEV_USER_ID,
  email: "user@fairy.local",
  role: "user",
  passwordHash: bcrypt.hashSync("user123456", 10),
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
});

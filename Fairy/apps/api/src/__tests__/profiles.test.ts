import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import * as profileService from "../services/profileService";
import { DEV_ADMIN_ID, DEV_USER_ID } from "@fairy/shared";
import type { Profile, ProfileListItem } from "@fairy/shared";

vi.mock("../services/profileService");

const sampleProfile: Profile = {
  userId: DEV_USER_ID,
  name: "铃",
  avatarUrl: null,
  styleTags: ["夜猫子"],
  likeGenres: ["科幻", "悬疑"],
  avoidFood: [],
  dietPreference: null,
  travelStyle: null,
  createdAt: "2024-01-15T10:20:00Z",
  updatedAt: "2024-08-05T18:45:00Z",
};

const sampleList: ProfileListItem[] = [
  {
    userId: DEV_USER_ID,
    email: "user@fairy.local",
    role: "user",
    profile: sampleProfile,
  },
  {
    userId: DEV_ADMIN_ID,
    email: "admin@fairy.local",
    role: "admin",
    profile: null,
  },
];

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: DEV_ADMIN_ID,
    name: "管理员",
    avatarUrl: "",
    styleTags: [],
    likeGenres: ["剧情"],
    avoidFood: [],
    dietPreference: null,
    travelStyle: null,
    ...overrides,
  };
}

describe("profiles routes", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when user role lists profiles", async () => {
    const response = await request(app)
      .get("/api/profiles")
      .set("X-Dev-Role", "user");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(profileService.listUsersWithProfiles).not.toHaveBeenCalled();
  });

  it("returns 403 when user role creates or patches", async () => {
    const createResponse = await request(app)
      .post("/api/profiles")
      .set("X-Dev-Role", "user")
      .send(createBody());

    expect(createResponse.status).toBe(403);
    expect(createResponse.body.code).toBe("FORBIDDEN");
    expect(profileService.createForExistingUser).not.toHaveBeenCalled();

    const patchResponse = await request(app)
      .patch(`/api/profiles/${DEV_USER_ID}`)
      .set("X-Dev-Role", "user")
      .send({ name: "改名" });

    expect(patchResponse.status).toBe(403);
    expect(profileService.updateByUserId).not.toHaveBeenCalled();
  });

  it("lists every user with optional profile for admin", async () => {
    vi.mocked(profileService.listUsersWithProfiles).mockResolvedValue(sampleList);

    const response = await request(app)
      .get("/api/profiles")
      .set("X-Dev-Role", "admin");

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("OK");

    const rows = response.body.data as ProfileListItem[];
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.userId === DEV_USER_ID)?.profile).not.toBeNull();
    expect(rows.find((row) => row.userId === DEV_ADMIN_ID)?.profile).toBeNull();
  });

  it("lets dev-user read own seeded profile", async () => {
    vi.mocked(profileService.getByUserId).mockResolvedValue(sampleProfile);

    const response = await request(app)
      .get(`/api/profiles/${DEV_USER_ID}`)
      .set("X-Dev-Role", "user");

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("铃");
  });

  it("returns 403 when user reads another user's profile", async () => {
    const response = await request(app)
      .get(`/api/profiles/${DEV_ADMIN_ID}`)
      .set("X-Dev-Role", "user");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(profileService.getByUserId).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-uuid userId", async () => {
    const response = await request(app)
      .get("/api/profiles/not-a-uuid")
      .set("X-Dev-Role", "admin");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_USER_ID");
  });

  it("returns 404 when profile is missing", async () => {
    vi.mocked(profileService.getByUserId).mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/profiles/${DEV_ADMIN_ID}`)
      .set("X-Dev-Role", "admin");

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("PROFILE_NOT_FOUND");
  });

  it("creates a profile for an existing user without one", async () => {
    vi.mocked(profileService.createForExistingUser).mockResolvedValue({
      ok: true,
      profile: { ...sampleProfile, userId: DEV_ADMIN_ID, name: "管理员" },
    });

    const response = await request(app)
      .post("/api/profiles")
      .set("X-Dev-Role", "admin")
      .send(createBody());

    expect(response.status).toBe(201);
    expect(response.body.code).toBe("OK");
    expect(profileService.createForExistingUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: DEV_ADMIN_ID, name: "管理员" })
    );
  });

  it("returns 409 when the profile already exists", async () => {
    vi.mocked(profileService.createForExistingUser).mockResolvedValue({
      ok: false,
      code: "PROFILE_ALREADY_EXISTS",
    });

    const response = await request(app)
      .post("/api/profiles")
      .set("X-Dev-Role", "admin")
      .send(createBody({ userId: DEV_USER_ID }));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("PROFILE_ALREADY_EXISTS");
  });

  it("returns 404 when creating for an unknown user", async () => {
    vi.mocked(profileService.createForExistingUser).mockResolvedValue({
      ok: false,
      code: "USER_NOT_FOUND",
    });

    const response = await request(app)
      .post("/api/profiles")
      .set("X-Dev-Role", "admin")
      .send(createBody({ userId: "00000000-0000-4000-8000-000000000099" }));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("USER_NOT_FOUND");
  });

  it("returns 400 for an invalid create body", async () => {
    const response = await request(app)
      .post("/api/profiles")
      .set("X-Dev-Role", "admin")
      .send(createBody({ name: "" }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(profileService.createForExistingUser).not.toHaveBeenCalled();
  });

  it("patches likeGenres for admin", async () => {
    vi.mocked(profileService.updateByUserId).mockResolvedValue({
      ...sampleProfile,
      likeGenres: ["动画"],
    });

    const response = await request(app)
      .patch(`/api/profiles/${DEV_USER_ID}`)
      .set("X-Dev-Role", "admin")
      .send({ likeGenres: ["动画"] });

    expect(response.status).toBe(200);
    expect(response.body.data.likeGenres).toEqual(["动画"]);
    expect(profileService.updateByUserId).toHaveBeenCalledWith(DEV_USER_ID, {
      likeGenres: ["动画"],
    });
  });

  it("returns 404 when patching a missing profile", async () => {
    vi.mocked(profileService.updateByUserId).mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/profiles/${DEV_ADMIN_ID}`)
      .set("X-Dev-Role", "admin")
      .send({ name: "改名" });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("PROFILE_NOT_FOUND");
  });

  it("returns 400 when patching with a non-uuid userId", async () => {
    const response = await request(app)
      .patch("/api/profiles/abc")
      .set("X-Dev-Role", "admin")
      .send({ name: "改名" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_USER_ID");
    expect(profileService.updateByUserId).not.toHaveBeenCalled();
  });

  it("does not offer delete", async () => {
    const response = await request(app)
      .delete(`/api/profiles/${DEV_USER_ID}`)
      .set("X-Dev-Role", "admin");

    expect(response.status).toBe(404);
  });
});

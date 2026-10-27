import { describe, expect, it } from "vitest";
import {
  createProfileSchema,
  profileListItemSchema,
  updateProfileSchema,
  userIdParamsSchema,
} from "./profileSchemas.js";

const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

function validCreateBody(): Record<string, unknown> {
  return {
    userId: DEV_USER_ID,
    name: "铃",
    avatarUrl: "",
    styleTags: ["夜猫子"],
    likeGenres: ["科幻", "悬疑"],
    avoidFood: [],
    dietPreference: "",
    travelStyle: "城市探索",
  };
}

describe("createProfileSchema", () => {
  it("accepts a full body and normalizes empty strings to null", () => {
    const result = createProfileSchema.safeParse(validCreateBody());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.avatarUrl).toBeNull();
      expect(result.data.dietPreference).toBeNull();
      expect(result.data.likeGenres).toEqual(["科幻", "悬疑"]);
    }
  });

  it("accepts empty arrays for array fields", () => {
    const body = { ...validCreateBody(), likeGenres: [], styleTags: [] };
    const result = createProfileSchema.safeParse(body);

    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const body = { ...validCreateBody(), name: "" };
    expect(createProfileSchema.safeParse(body).success).toBe(false);
  });

  it("rejects a non-uuid userId", () => {
    const body = { ...validCreateBody(), userId: "not-a-uuid" };
    expect(createProfileSchema.safeParse(body).success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("accepts a partial body", () => {
    const result = updateProfileSchema.safeParse({ likeGenres: ["动画"] });

    expect(result.success).toBe(true);
  });

  it("accepts an empty patch", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true);
  });

  it("does not allow changing userId", () => {
    const result = updateProfileSchema.safeParse({
      userId: DEV_USER_ID,
      name: "改名",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBeUndefined();
      expect(result.data.name).toBe("改名");
    }
  });
});

describe("profileListItemSchema", () => {
  it("accepts a row with a null profile", () => {
    const row = {
      userId: DEV_USER_ID,
      email: "user@fairy.local",
      role: "user",
      profile: null,
    };

    expect(profileListItemSchema.safeParse(row).success).toBe(true);
  });

  it("accepts a row with a profile document", () => {
    const row = {
      userId: DEV_USER_ID,
      email: "user@fairy.local",
      role: "user",
      profile: {
        userId: DEV_USER_ID,
        name: "铃",
        avatarUrl: null,
        styleTags: [],
        likeGenres: ["科幻"],
        avoidFood: [],
        dietPreference: null,
        travelStyle: null,
        createdAt: "2024-01-15T10:20:00Z",
        updatedAt: "2024-08-05T18:45:00Z",
      },
    };

    expect(profileListItemSchema.safeParse(row).success).toBe(true);
  });
});

describe("userIdParamsSchema", () => {
  it("accepts a uuid param", () => {
    expect(userIdParamsSchema.safeParse({ userId: DEV_USER_ID }).success).toBe(true);
  });

  it("rejects a non-uuid param", () => {
    expect(userIdParamsSchema.safeParse({ userId: "abc" }).success).toBe(false);
  });
});

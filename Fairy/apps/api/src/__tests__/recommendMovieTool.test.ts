import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import type { Movie, Profile } from "@fairy/shared";
import { DEV_USER_ID } from "@fairy/shared";
import { recommendMovieTool } from "../tools/recommendMovieTool";
import * as movieService from "../services/movieService";
import * as profileService from "../services/profileService";

vi.mock("../services/movieService");
vi.mock("../services/profileService");
// behaviorLogService 不 mock：经真实 appendQuietly → append → prisma.behaviorLog.create
// 走完整链路，「日志写失败仍 success」才测得的是生产行为而非 mock 行为
vi.mock("@fairy/database", () => ({
  prisma: {
    behaviorLog: {
      create: vi.fn(),
    },
  },
}));

function movie(id: string, title: string, genres: string[]): Movie {
  return {
    id,
    title,
    director: "导演",
    year: 2020,
    mood: ["治愈"],
    scene: ["雨天"],
    genres,
    quote: null,
    stock: 2,
    totalStock: 3,
    coverUrl: null,
    description: "",
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-08-01T12:30:00Z",
  };
}

const sciFiMovie = movie("550e8400-e29b-41d4-a716-446655440000", "星际穿越", ["科幻", "冒险"]);
const animeMovie = movie("550e8400-e29b-41d4-a716-446655440001", "千与千寻", ["动画", "剧情"]);

function profileWithLikes(likeGenres: string[]): Profile {
  return {
    userId: DEV_USER_ID,
    name: "铃",
    avatarUrl: null,
    styleTags: [],
    likeGenres,
    avoidFood: [],
    dietPreference: null,
    travelStyle: null,
    createdAt: "2024-01-15T10:20:00Z",
    updatedAt: "2024-08-05T18:45:00Z",
  };
}

describe("recommendMovieTool with patched likeGenres", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(movieService.listMoviesForRecommend).mockResolvedValue([sciFiMovie, animeMovie]);
  });

  it("ranks exact genre overlap first and flips after likeGenres patch", async () => {
    vi.mocked(profileService.getByUserId).mockResolvedValueOnce(profileWithLikes(["科幻", "悬疑"]));

    const before = await recommendMovieTool({
      userId: DEV_USER_ID,
      moods: ["治愈"],
      scenes: ["雨天"],
    });
    expect(before.data?.[0]?.title).toBe("星际穿越");

    vi.mocked(profileService.getByUserId).mockResolvedValueOnce(profileWithLikes(["动画"]));

    const after = await recommendMovieTool({
      userId: DEV_USER_ID,
      moods: ["治愈"],
      scenes: ["雨天"],
    });
    expect(after.data?.[0]?.title).toBe("千与千寻");
  });

  it("falls back to title order when no likes overlap", async () => {
    vi.mocked(profileService.getByUserId).mockResolvedValue(profileWithLikes(["爱情"]));

    const result = await recommendMovieTool({
      userId: DEV_USER_ID,
      moods: ["治愈"],
      scenes: ["雨天"],
    });

    expect(result.data?.map((movie) => movie.title)).toEqual(["千与千寻", "星际穿越"]);
  });

  it("still recommends tag matches for a user without a profile", async () => {
    vi.mocked(profileService.getByUserId).mockResolvedValue(null);

    const result = await recommendMovieTool({
      userId: DEV_USER_ID,
      moods: ["治愈"],
      scenes: ["雨天"],
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it("logs RECOMMEND with the ranked movie ids", async () => {
    vi.mocked(profileService.getByUserId).mockResolvedValue(profileWithLikes(["科幻"]));

    await recommendMovieTool({ userId: DEV_USER_ID, moods: ["治愈"], scenes: ["雨天"] });

    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: DEV_USER_ID,
        action: "RECOMMEND",
        payload: { movieIds: [sciFiMovie.id, animeMovie.id] },
      }),
    });
  });

  it("still succeeds when the RECOMMEND log write throws", async () => {
    vi.mocked(profileService.getByUserId).mockResolvedValue(profileWithLikes(["科幻"]));
    vi.mocked(prisma.behaviorLog.create).mockRejectedValue(new Error("db down"));

    const result = await recommendMovieTool({
      userId: DEV_USER_ID,
      moods: ["治愈"],
      scenes: ["雨天"],
    });

    // 推荐结果已生成：日志失败只应损失可观测性，不能把既成事实翻成 500
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, type Movie, type Profile as ProfileRow } from "@fairy/database";
import {
  loadGenreWhitelist,
  mergeLikeGenres,
  resetGenreWhitelistForTests,
} from "../services/profileService.js";

const { MockPrismaClientKnownRequestError } = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return { MockPrismaClientKnownRequestError };
});

vi.mock("@fairy/database", () => {
  const profile = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  return {
    prisma: {
      profile,
      movie: { findMany: vi.fn() },
      // 交互式事务：把 tx 接回同一个 profile mock，便于断言事务内的 findUnique/update。
      $transaction: vi.fn(async (callback: (tx: { profile: typeof profile }) => Promise<unknown>) =>
        callback({ profile }),
      ),
    },
    Prisma: {
      PrismaClientKnownRequestError: MockPrismaClientKnownRequestError,
    },
  };
});

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";

// 影片库词表 fixture：含重复、脏值（"1233" 纯数字）、空串与空数组，检验白名单只保留干净唯一值。
// 仅携带 genres 子集即可（service 只 select genres）；按 memoryService.test 惯例用 full-row 类型断言。
const LIBRARY_ROWS = [
  { genres: ["科幻", "冒险"] },
  { genres: ["剧情", "动作"] },
  { genres: ["动作", " 动作 "] },
  { genres: ["1233"] },
  { genres: [""] },
  { genres: [] },
] as unknown as Movie[];

const WHITELIST = ["科幻", "冒险", "剧情", "动作"];

function likeGenresRow(likeGenres: string[]): ProfileRow {
  return { likeGenres } as unknown as ProfileRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetGenreWhitelistForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("profileService.loadGenreWhitelist (FU-18)", () => {
  it("collects distinct non-blank non-numeric genres from the library", async () => {
    vi.mocked(prisma.movie.findMany).mockResolvedValue(LIBRARY_ROWS);

    const whitelist = await loadGenreWhitelist();

    expect(whitelist).toEqual(WHITELIST);
    expect(prisma.movie.findMany).toHaveBeenCalledWith({ select: { genres: true } });
  });

  it("serves repeat calls from the in-process TTL cache", async () => {
    vi.mocked(prisma.movie.findMany).mockResolvedValue(LIBRARY_ROWS);

    await loadGenreWhitelist();
    await loadGenreWhitelist();

    expect(prisma.movie.findMany).toHaveBeenCalledTimes(1);
  });

  it("refetches after the 5-minute TTL expires", async () => {
    vi.useFakeTimers();
    vi.mocked(prisma.movie.findMany).mockResolvedValue(LIBRARY_ROWS);

    await loadGenreWhitelist();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await loadGenreWhitelist();

    expect(prisma.movie.findMany).toHaveBeenCalledTimes(2);
  });

  it("degrades to an empty whitelist on query failure without caching the failure", async () => {
    vi.mocked(prisma.movie.findMany).mockRejectedValueOnce(new Error("db down"));

    await expect(loadGenreWhitelist()).resolves.toEqual([]);

    // 失败不落缓存：下一次调用仍会重试查询。
    vi.mocked(prisma.movie.findMany).mockResolvedValueOnce(LIBRARY_ROWS);
    await expect(loadGenreWhitelist()).resolves.toEqual(WHITELIST);
    expect(prisma.movie.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("profileService.mergeLikeGenres (FU-18)", () => {
  beforeEach(() => {
    vi.mocked(prisma.movie.findMany).mockResolvedValue(LIBRARY_ROWS);
  });

  it("merges recognized candidates into existing tags without removing any", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(likeGenresRow(["科幻", "爱情"]));

    await mergeLikeGenres(PROFILE_ID, ["科幻", "动作"]);

    expect(prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId: PROFILE_ID },
      select: { likeGenres: true },
    });
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: PROFILE_ID },
      data: { likeGenres: ["科幻", "爱情", "动作"] },
    });
  });

  it("dedupes candidates within one call and against existing tags", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(likeGenresRow(["科幻"]));

    await mergeLikeGenres(PROFILE_ID, ["动作", "动作", "科幻"]);

    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: PROFILE_ID },
      data: { likeGenres: ["科幻", "动作"] },
    });
  });

  it("is idempotent: no update when the union is unchanged (replay)", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(likeGenresRow(["科幻", "动作"]));

    await mergeLikeGenres(PROFILE_ID, ["动作", "科幻"]);
    await mergeLikeGenres(PROFILE_ID, ["动作", "科幻"]);

    expect(prisma.profile.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it("skips the transaction entirely when no candidate matches the whitelist", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(likeGenresRow(["科幻"]));

    await mergeLikeGenres(PROFILE_ID, ["武侠", "1233", ""]);

    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
    expect(prisma.profile.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("skips silently when the profile is missing", async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);

    await expect(mergeLikeGenres(PROFILE_ID, ["科幻"])).resolves.toBeUndefined();

    expect(prisma.profile.findUnique).toHaveBeenCalled();
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it("skips silently when the whitelist query fails", async () => {
    vi.mocked(prisma.movie.findMany).mockRejectedValue(new Error("db down"));

    await expect(mergeLikeGenres(PROFILE_ID, ["科幻"])).resolves.toBeUndefined();

    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });
});

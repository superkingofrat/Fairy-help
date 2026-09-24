import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import { returnMovieTool } from "../tools/returnMovieTool";
import * as rentalService from "../services/rentalService";

vi.mock("../services/rentalService");
// behaviorLogService 不 mock：经真实 appendQuietly → append → prisma.behaviorLog.create
// 走完整链路，「日志写失败仍 success」才测得的是生产行为而非 mock 行为
vi.mock("@fairy/database", () => ({
  prisma: {
    behaviorLog: {
      create: vi.fn(),
    },
  },
}));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";
const RENTAL_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("returnMovieTool behavior logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs RETURN_SUCCESS and returns the rental on the happy path", async () => {
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: true,
      rentalId: RENTAL_ID,
      remainingStock: 3,
    });

    const result = await returnMovieTool({ userId: USER_ID, movieId: MOVIE_ID });

    expect(result).toEqual({
      success: true,
      data: { remainingStock: 3, rentalId: RENTAL_ID },
    });
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: "RETURN_SUCCESS",
        movieId: MOVIE_ID,
        rentalId: RENTAL_ID,
      },
    });
  });

  it("still reports success when the RETURN_SUCCESS log write throws", async () => {
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: true,
      rentalId: RENTAL_ID,
      remainingStock: 3,
    });
    vi.mocked(prisma.behaviorLog.create).mockRejectedValue(new Error("db down"));

    const result = await returnMovieTool({ userId: USER_ID, movieId: MOVIE_ID });

    // 库存已回滚：日志失败只应损失可观测性，不能把既成事实翻成 500
    expect(result).toEqual({
      success: true,
      data: { remainingStock: 3, rentalId: RENTAL_ID },
    });
  });

  it("still reports RENTAL_NOT_FOUND without writing a success log", async () => {
    vi.mocked(rentalService.returnRental).mockResolvedValue({
      ok: false,
      code: "RENTAL_NOT_FOUND",
    });

    const result = await returnMovieTool({ userId: USER_ID, movieId: MOVIE_ID });

    expect(result).toEqual({ success: false, error: "RENTAL_NOT_FOUND" });
    expect(prisma.behaviorLog.create).not.toHaveBeenCalled();
  });
});

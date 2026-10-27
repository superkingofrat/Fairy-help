import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import { borrowMovieTool } from "../tools/borrowMovieTool.js";
import * as rentalService from "../services/rentalService.js";

vi.mock("../services/rentalService.js");
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

describe("borrowMovieTool behavior logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs BORROW_SUCCESS and returns the rental on the happy path", async () => {
    vi.mocked(rentalService.borrow).mockResolvedValue({
      ok: true,
      rentalId: RENTAL_ID,
      remainingStock: 2,
    });

    const result = await borrowMovieTool({ userId: USER_ID, movieId: MOVIE_ID });

    expect(result).toEqual({
      success: true,
      data: { remainingStock: 2, rentalId: RENTAL_ID },
    });
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: "BORROW_SUCCESS",
        movieId: MOVIE_ID,
        rentalId: RENTAL_ID,
      },
    });
  });

  it("still reports success when the BORROW_SUCCESS log write throws", async () => {
    vi.mocked(rentalService.borrow).mockResolvedValue({
      ok: true,
      rentalId: RENTAL_ID,
      remainingStock: 2,
    });
    vi.mocked(prisma.behaviorLog.create).mockRejectedValue(new Error("db down"));

    const result = await borrowMovieTool({ userId: USER_ID, movieId: MOVIE_ID });

    // 库存已扣减：日志失败只应损失可观测性，不能把既成事实翻成 500
    expect(result).toEqual({
      success: true,
      data: { remainingStock: 2, rentalId: RENTAL_ID },
    });
  });

  it("still reports OUT_OF_STOCK when the failure log write throws", async () => {
    vi.mocked(rentalService.borrow).mockResolvedValue({ ok: false, code: "OUT_OF_STOCK" });
    vi.mocked(prisma.behaviorLog.create).mockRejectedValue(new Error("db down"));

    const result = await borrowMovieTool({ userId: USER_ID, movieId: MOVIE_ID });

    expect(result).toEqual({ success: false, error: "OUT_OF_STOCK" });
    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, action: "BORROW_OUT_OF_STOCK", movieId: MOVIE_ID },
    });
  });
});

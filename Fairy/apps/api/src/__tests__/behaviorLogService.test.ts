import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import { listLogs } from "../services/behaviorLogService";
import * as movieService from "../services/movieService";
import type { BehaviorLogQuery } from "@fairy/shared";

vi.mock("@fairy/database", () => ({
  prisma: {
    behaviorLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));
vi.mock("../services/movieService");

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "990e8400-e29b-41d4-a716-446655440000",
    userId: "00000000-0000-4000-8000-000000000001",
    action: "BORROW_SUCCESS",
    movieId: "550e8400-e29b-41d4-a716-446655440000",
    rentalId: "880e8400-e29b-41d4-a716-446655440000",
    payload: null,
    createdAt: new Date("2026-08-29T08:00:00.000Z"),
    user: { email: "user@fairy.local" },
    ...overrides,
  };
}

describe("behaviorLogService.listLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(movieService.listMoviesByIds).mockResolvedValue([
      { id: "550e8400-e29b-41d4-a716-446655440000", title: "星际穿越" },
    ]);
  });

  it("returns resolved items and total", async () => {
    vi.mocked(prisma.behaviorLog.findMany).mockResolvedValue([
      record(),
      record({
        id: "990e8400-e29b-41d4-a716-446655440001",
        action: "RECOMMEND",
        movieId: null,
        rentalId: null,
        payload: { movieIds: ["a", "b", "c"] },
      }),
    ] as never);
    vi.mocked(prisma.behaviorLog.count).mockResolvedValue(2);

    const result = await listLogs({ page: 1, limit: 20 } satisfies BehaviorLogQuery);

    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({
      email: "user@fairy.local",
      movieTitle: "星际穿越",
      recommendCount: null,
    });
    expect(result.items[1]).toMatchObject({
      action: "RECOMMEND",
      movieTitle: null,
      recommendCount: 3,
    });
    expect(movieService.listMoviesByIds).toHaveBeenCalledWith([
      "550e8400-e29b-41d4-a716-446655440000",
    ]);
  });

  it("builds the where clause from filters", async () => {
    vi.mocked(prisma.behaviorLog.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.behaviorLog.count).mockResolvedValue(0);

    await listLogs({
      page: 2,
      limit: 5,
      action: "RECOMMEND",
      userId: "00000000-0000-4000-8000-000000000001",
    });

    expect(prisma.behaviorLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: "RECOMMEND",
          userId: "00000000-0000-4000-8000-000000000001",
        },
        skip: 5,
        take: 5,
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("tolerates a RECOMMEND row without payload", async () => {
    vi.mocked(prisma.behaviorLog.findMany).mockResolvedValue([
      record({ action: "RECOMMEND", movieId: null, rentalId: null, payload: null }),
    ] as never);
    vi.mocked(prisma.behaviorLog.count).mockResolvedValue(1);

    const result = await listLogs({ page: 1, limit: 20 });

    expect(result.items[0].recommendCount).toBeNull();
  });
});

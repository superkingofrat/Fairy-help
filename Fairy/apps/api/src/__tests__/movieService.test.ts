import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import { listMoviesByIds } from "../services/movieService.js";

vi.mock("@fairy/database", () => ({
  prisma: {
    movie: {
      findMany: vi.fn(),
    },
  },
}));

describe("movieService.listMoviesByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] without querying when the id list is empty", async () => {
    const result = await listMoviesByIds([]);

    expect(result).toEqual([]);
    expect(prisma.movie.findMany).not.toHaveBeenCalled();
  });

  it("deduplicates ids before querying", async () => {
    vi.mocked(prisma.movie.findMany).mockResolvedValue([
      { id: "a", title: "甲" },
      { id: "b", title: "乙" },
    ] as never);

    const result = await listMoviesByIds(["a", "b", "a", ""]);

    expect(prisma.movie.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      select: { id: true, title: true },
    });
    expect(result).toEqual([
      { id: "a", title: "甲" },
      { id: "b", title: "乙" },
    ]);
  });
});

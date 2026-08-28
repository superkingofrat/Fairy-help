import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import { borrow } from "../services/rentalService";

vi.mock("@fairy/database", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe("RentalService.borrow", () => {
  const tx = {
    movie: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    rental: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as unknown as typeof prisma.$transaction
    );
  });

  it("decrements stock when available", async () => {
    tx.movie.findUnique
      .mockResolvedValueOnce({ id: "m1", stock: 3 })
      .mockResolvedValueOnce({ id: "m1", stock: 2 });
    tx.rental.findFirst.mockResolvedValue(null);
    tx.movie.updateMany.mockResolvedValue({ count: 1 });
    tx.rental.create.mockResolvedValue({ id: "r1" });

    const result = await borrow("u1", "m1");
    expect(result).toEqual({ ok: true, rentalId: "r1", remainingStock: 2 });
  });

  it("returns ALREADY_BORROWED without decrement", async () => {
    tx.movie.findUnique.mockResolvedValue({ id: "m1", stock: 3 });
    tx.rental.findFirst.mockResolvedValue({ id: "existing" });

    const result = await borrow("u1", "m1");
    expect(result).toEqual({ ok: false, code: "ALREADY_BORROWED" });
    expect(tx.movie.updateMany).not.toHaveBeenCalled();
  });

  it("returns OUT_OF_STOCK when stock is 0", async () => {
    tx.movie.findUnique.mockResolvedValue({ id: "m1", stock: 0 });
    tx.rental.findFirst.mockResolvedValue(null);

    const result = await borrow("u1", "m1");
    expect(result).toEqual({ ok: false, code: "OUT_OF_STOCK" });
  });
});

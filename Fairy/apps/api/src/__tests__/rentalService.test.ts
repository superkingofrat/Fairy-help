import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import { borrow, listActiveRentals, returnRental } from "../services/rentalService";

vi.mock("@fairy/database", () => ({
  prisma: {
    $transaction: vi.fn(),
    rental: {
      findMany: vi.fn(),
    },
  },
}));

describe("RentalService.borrow", () => {
  const tx = {
    movie: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    rental: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as unknown as typeof prisma.$transaction
    );
    tx.$queryRaw.mockResolvedValue(undefined);
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

describe("RentalService.returnRental", () => {
  const tx = {
    movie: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    rental: {
      updateMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as unknown as typeof prisma.$transaction
    );
  });

  it("closes the rental and increments stock (CAS)", async () => {
    tx.rental.updateMany.mockResolvedValue({ count: 1 });
    tx.movie.update.mockResolvedValue({ id: "m1", stock: 3 });
    tx.movie.findUnique.mockResolvedValue({ id: "m1", stock: 3 });

    const result = await returnRental("u1", "m1");

    expect(result).toEqual(expect.objectContaining({ ok: true, remainingStock: 3 }));
    expect(tx.rental.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", movieId: "m1", status: "ACTIVE" },
      data: { status: "RETURNED" },
    });
    expect(tx.movie.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { stock: { increment: 1 } },
    });
  });

  it("returns RENTAL_NOT_FOUND without stock change when no active rental", async () => {
    tx.rental.updateMany.mockResolvedValue({ count: 0 });

    const result = await returnRental("u1", "m1");

    expect(result).toEqual({ ok: false, code: "RENTAL_NOT_FOUND" });
    expect(tx.movie.update).not.toHaveBeenCalled();
  });

  it("rejects a repeat return idempotently", async () => {
    tx.rental.updateMany.mockResolvedValue({ count: 0 });

    const first = await returnRental("u1", "m1");
    const second = await returnRental("u1", "m1");

    expect(first).toEqual({ ok: false, code: "RENTAL_NOT_FOUND" });
    expect(second).toEqual({ ok: false, code: "RENTAL_NOT_FOUND" });
    expect(tx.movie.update).not.toHaveBeenCalled();
  });
});

describe("RentalService.listActiveRentals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps active rentals with movie titles", async () => {
    vi.mocked(prisma.rental.findMany).mockResolvedValue([
      {
        id: "r1",
        movieId: "m1",
        createdAt: new Date("2026-08-29T08:00:00.000Z"),
        movie: { title: "千与千寻" },
      },
    ] as never);

    const result = await listActiveRentals("u1");

    expect(prisma.rental.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      })
    );
    expect(result).toEqual([
      {
        id: "r1",
        movieId: "m1",
        movieTitle: "千与千寻",
        createdAt: "2026-08-29T08:00:00.000Z",
      },
    ]);
  });
});

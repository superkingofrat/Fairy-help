import { prisma } from "@fairy/database";
import type { BorrowErrorCode, RentalListItem, ReturnErrorCode } from "@fairy/shared";

export type BorrowResult =
  { ok: true; rentalId: string; remainingStock: number } | { ok: false; code: BorrowErrorCode };

export type ReturnResult =
  | { ok: true; rentalId: string | null; remainingStock: number }
  | { ok: false; code: ReturnErrorCode };

export interface ActiveRental {
  id: string;
  movieId: string;
  movieTitle: string;
  createdAt: string;
}

export async function borrow(userId: string, movieId: string): Promise<BorrowResult> {
  return prisma.$transaction(async (tx) => {
    // 并发安全：锁定影片行，串行化同片借还事务
    await tx.$queryRaw`SELECT id FROM movies WHERE id = ${movieId} FOR UPDATE`;

    const movie = await tx.movie.findUnique({ where: { id: movieId } });
    if (!movie) {
      return { ok: false, code: "MOVIE_NOT_FOUND" };
    }

    const existing = await tx.rental.findFirst({
      where: { userId, movieId, status: "ACTIVE" },
    });
    if (existing) {
      return { ok: false, code: "ALREADY_BORROWED" };
    }

    if (movie.stock < 1) {
      return { ok: false, code: "OUT_OF_STOCK" };
    }

    const updated = await tx.movie.updateMany({
      where: { id: movieId, stock: { gt: 0 } },
      data: { stock: { decrement: 1 } },
    });
    if (updated.count === 0) {
      return { ok: false, code: "OUT_OF_STOCK" };
    }

    const rental = await tx.rental.create({
      data: { userId, movieId, status: "ACTIVE" },
    });
    const fresh = await tx.movie.findUnique({ where: { id: movieId } });

    return {
      ok: true,
      rentalId: rental.id,
      remainingStock: fresh?.stock ?? movie.stock - 1,
    };
  });
}

export async function returnRental(userId: string, movieId: string): Promise<ReturnResult> {
  return prisma.$transaction(async (tx) => {
    // 并发安全：一次性条件更新（compare-and-swap），避免先读后写的竞态
    const closed = await tx.rental.updateMany({
      where: { userId, movieId, status: "ACTIVE" },
      data: { status: "RETURNED" },
    });
    if (closed.count === 0) {
      return { ok: false, code: "RENTAL_NOT_FOUND" };
    }

    await tx.movie.update({
      where: { id: movieId },
      data: { stock: { increment: 1 } },
    });
    const fresh = await tx.movie.findUnique({ where: { id: movieId } });

    return {
      ok: true,
      rentalId: null,
      remainingStock: fresh?.stock ?? 0,
    };
  });
}

export async function listActiveRentals(userId: string): Promise<ActiveRental[]> {
  const rentals = await prisma.rental.findMany({
    where: { userId, status: "ACTIVE" },
    include: { movie: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });

  return rentals.map((rental) => ({
    id: rental.id,
    movieId: rental.movieId,
    movieTitle: rental.movie.title,
    createdAt: rental.createdAt.toISOString(),
  }));
}

export interface RentalListOptions {
  status?: "ACTIVE";
}

export async function listRentals(
  userId: string,
  opts: RentalListOptions = {},
): Promise<RentalListItem[]> {
  const rentals = await prisma.rental.findMany({
    where: { userId, ...(opts.status ? { status: opts.status } : {}) },
    include: { movie: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });

  return rentals.map((rental) => ({
    rentalId: rental.id,
    movieId: rental.movieId,
    movieTitle: rental.movie.title,
    status: rental.status,
    borrowedAt: rental.createdAt.toISOString(),
    returnedAt: rental.status === "RETURNED" ? rental.updatedAt.toISOString() : null,
  }));
}

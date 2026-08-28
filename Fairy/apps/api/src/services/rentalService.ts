import { prisma } from "@fairy/database";
import type { BorrowErrorCode } from "@fairy/shared";

export type BorrowResult =
  | { ok: true; rentalId: string; remainingStock: number }
  | { ok: false; code: BorrowErrorCode };

export async function borrow(userId: string, movieId: string): Promise<BorrowResult> {
  return prisma.$transaction(async (tx) => {
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

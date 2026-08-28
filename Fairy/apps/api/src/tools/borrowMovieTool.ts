import * as rentalService from "../services/rentalService";
import * as behaviorLogService from "../services/behaviorLogService";
import type { BorrowErrorCode } from "@fairy/shared";

export async function borrowMovieTool(input: {
  userId: string;
  movieId: string;
}): Promise<{
  success: boolean;
  data?: { remainingStock: number; rentalId: string };
  error?: BorrowErrorCode;
}> {
  const result = await rentalService.borrow(input.userId, input.movieId);

  if (!result.ok) {
    if (result.code === "OUT_OF_STOCK") {
      await behaviorLogService.append({
        userId: input.userId,
        action: "BORROW_OUT_OF_STOCK",
        movieId: input.movieId,
      });
    }
    return { success: false, error: result.code };
  }

  await behaviorLogService.append({
    userId: input.userId,
    action: "BORROW_SUCCESS",
    movieId: input.movieId,
    rentalId: result.rentalId,
  });

  return {
    success: true,
    data: { remainingStock: result.remainingStock, rentalId: result.rentalId },
  };
}

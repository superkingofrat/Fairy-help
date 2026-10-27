import * as rentalService from "../services/rentalService.js";
import * as behaviorLogService from "../services/behaviorLogService.js";
import type { ReturnErrorCode } from "@fairy/shared";

export async function returnMovieTool(input: { userId: string; movieId: string }): Promise<{
  success: boolean;
  data?: { remainingStock: number; rentalId: string | null };
  error?: ReturnErrorCode;
}> {
  const result = await rentalService.returnRental(input.userId, input.movieId);

  if (!result.ok) {
    return { success: false, error: result.code };
  }

  await behaviorLogService.appendQuietly({
    userId: input.userId,
    action: "RETURN_SUCCESS",
    movieId: input.movieId,
    rentalId: result.rentalId ?? undefined,
  });

  return {
    success: true,
    data: { remainingStock: result.remainingStock, rentalId: result.rentalId },
  };
}

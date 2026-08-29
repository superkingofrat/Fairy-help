import * as rentalService from "../services/rentalService";
import * as behaviorLogService from "../services/behaviorLogService";
import type { ReturnErrorCode } from "@fairy/shared";

export async function returnMovieTool(input: {
  userId: string;
  movieId: string;
}): Promise<{
  success: boolean;
  data?: { remainingStock: number; rentalId: string };
  error?: ReturnErrorCode;
}> {
  const result = await rentalService.returnRental(input.userId, input.movieId);

  if (!result.ok) {
    return { success: false, error: result.code };
  }

  await behaviorLogService.append({
    userId: input.userId,
    action: "RETURN_SUCCESS",
    movieId: input.movieId,
    rentalId: result.rentalId,
  });

  return {
    success: true,
    data: { remainingStock: result.remainingStock, rentalId: result.rentalId },
  };
}

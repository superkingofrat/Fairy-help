import { recommendMovieTool } from "../tools/recommendMovieTool";
import { borrowMovieTool } from "../tools/borrowMovieTool";
import { returnMovieTool } from "../tools/returnMovieTool";
import type { PlannedCall } from "./planner";
import type { Movie } from "@fairy/shared";

export type ToolObservation =
  | { kind: "recommend"; movies: Movie[] }
  | {
      kind: "borrow";
      success: boolean;
      remainingStock: number | null;
      rentalId: string | null;
      code: string;
    }
  | {
      kind: "return";
      success: boolean;
      remainingStock: number | null;
      rentalId: string | null;
      code: string;
    }
  | {
      kind: "none";
      reason: "unmatched" | "borrow_unresolved" | "return_unresolved" | "chitchat";
    };

export async function dispatch(
  plan: PlannedCall,
  userId: string
): Promise<ToolObservation> {
  if (plan.tool === "recommend") {
    const result = await recommendMovieTool({
      userId,
      moods: plan.moods,
      scenes: plan.scenes,
    });
    return { kind: "recommend", movies: result.data ?? [] };
  }

  if (plan.tool === "borrow") {
    const result = await borrowMovieTool({ userId, movieId: plan.movieId });
    if (result.success && result.data) {
      return {
        kind: "borrow",
        success: true,
        remainingStock: result.data.remainingStock,
        rentalId: result.data.rentalId,
        code: "OK",
      };
    }
    return {
      kind: "borrow",
      success: false,
      remainingStock: null,
      rentalId: null,
      code: result.error ?? "INTERNAL_ERROR",
    };
  }

  if (plan.tool === "return") {
    const result = await returnMovieTool({ userId, movieId: plan.movieId });
    if (result.success && result.data) {
      return {
        kind: "return",
        success: true,
        remainingStock: result.data.remainingStock,
        rentalId: result.data.rentalId,
        code: "OK",
      };
    }
    return {
      kind: "return",
      success: false,
      remainingStock: null,
      rentalId: null,
      code: result.error ?? "INTERNAL_ERROR",
    };
  }

  return { kind: "none", reason: plan.reason };
}

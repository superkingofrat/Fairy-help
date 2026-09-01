import { recommendMovieTool } from "../tools/recommendMovieTool";
import { borrowMovieTool } from "../tools/borrowMovieTool";
import { returnMovieTool } from "../tools/returnMovieTool";
import { storeInsightTool } from "../tools/storeInsightTool";
import type { PlannedCall } from "./planner";
import type { Movie, StoreInsightsOverview, InsightTopic } from "@fairy/shared";
import type { Role } from "../middleware/auth";

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
      kind: "insight";
      success: boolean;
      forbidden: boolean;
      topic: InsightTopic;
      overview: StoreInsightsOverview | null;
      code: string;
    }
  | {
      kind: "none";
      reason: "unmatched" | "borrow_unresolved" | "return_unresolved" | "chitchat";
    };

export async function dispatch(
  plan: PlannedCall,
  userId: string,
  role: Role = "user"
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

  if (plan.tool === "insight") {
    // 运营数据仅对 admin 开放；非 admin 不调用工具、不返回任何数据
    if (role !== "admin") {
      return {
        kind: "insight",
        success: false,
        forbidden: true,
        topic: plan.topic,
        overview: null,
        code: "FORBIDDEN",
      };
    }
    const result = await storeInsightTool();
    if (result.success && result.data) {
      return {
        kind: "insight",
        success: true,
        forbidden: false,
        topic: plan.topic,
        overview: result.data,
        code: "OK",
      };
    }
    return {
      kind: "insight",
      success: false,
      forbidden: false,
      topic: plan.topic,
      overview: null,
      code: result.error ?? "INSIGHT_UNAVAILABLE",
    };
  }

  return { kind: "none", reason: plan.reason };
}

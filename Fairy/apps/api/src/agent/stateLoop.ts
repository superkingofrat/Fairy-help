import type { Profile } from "@fairy/shared";
import * as profileService from "../services/profileService";
import * as rentalService from "../services/rentalService";
import { classifyIntent } from "./intentClassifier";
import { plan } from "./planner";
import { dispatch, type ToolObservation } from "./toolDispatcher";
import { returnMovieTool } from "../tools/returnMovieTool";
import { synthesize, type SynthesizedResponse } from "./responseSynthesizer";
import type { Role } from "../middleware/auth";

export async function runChatTurn(input: {
  userId: string;
  message: string;
  movieId?: string;
  action?: "return";
  history?: string;
  role?: Role;
}): Promise<SynthesizedResponse> {
  // 画像一次查询：dispatch（行程身份门禁）与 synthesize（回复人设）共用
  const profile: Profile | null = await profileService
    .getByUserId(input.userId)
    .catch(() => null);

  if (input.action === "return" && input.movieId) {
    const result = await returnMovieTool({
      userId: input.userId,
      movieId: input.movieId,
    });
    const observation: ToolObservation =
      result.success && result.data
        ? {
            kind: "return",
            success: true,
            remainingStock: result.data.remainingStock,
            rentalId: result.data.rentalId,
            code: "OK",
          }
        : {
            kind: "return",
            success: false,
            remainingStock: null,
            rentalId: null,
            code: result.error ?? "INTERNAL_ERROR",
          };
    return synthesize(observation, {
      message: input.message,
      profile,
      history: input.history,
    });
  }

  const intent = await classifyIntent({
    message: input.message,
    movieId: input.movieId,
    history: input.history,
  });
  const planned = plan(intent);
  const observation = await dispatch(
    planned,
    input.userId,
    input.role,
    input.message,
    profile
  );

  if (observation.kind === "none" && observation.reason === "return_unresolved") {
    const activeRentals = await rentalService.listActiveRentals(input.userId).catch(() => []);
    return synthesize(observation, {
      message: input.message,
      profile,
      activeRentals,
      history: input.history,
    });
  }

  return synthesize(observation, {
    message: input.message,
    profile,
    history: input.history,
  });
}

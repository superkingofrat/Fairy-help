import type { Profile } from "@fairy/shared";
import * as profileService from "../services/profileService";
import * as rentalService from "../services/rentalService";
import { classifyIntent } from "./intentClassifier";
import { plan } from "./planner";
import { dispatch } from "./toolDispatcher";
import { synthesize, type SynthesizedResponse } from "./responseSynthesizer";

export async function runChatTurn(input: {
  userId: string;
  message: string;
  movieId?: string;
}): Promise<SynthesizedResponse> {
  const intent = await classifyIntent({ message: input.message, movieId: input.movieId });
  const planned = plan(intent);
  const observation = await dispatch(planned, input.userId);
  const profile: Profile | null = await profileService
    .getByUserId(input.userId)
    .catch(() => null);

  if (observation.kind === "none" && observation.reason === "return_unresolved") {
    const activeRentals = await rentalService.listActiveRentals(input.userId).catch(() => []);
    return synthesize(observation, {
      message: input.message,
      profile,
      activeRentals,
    });
  }

  return synthesize(observation, { message: input.message, profile });
}

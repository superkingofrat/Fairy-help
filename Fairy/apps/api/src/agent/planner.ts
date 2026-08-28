import type { Mood, Scene } from "@fairy/shared";
import type { ChatIntent } from "./intentClassifier";

export type PlannedCall =
  | { tool: "recommend"; moods: Mood[]; scenes: Scene[] }
  | { tool: "borrow"; movieId: string }
  | { tool: "none"; reason: "unmatched" | "borrow_unresolved" };

export function plan(intent: ChatIntent): PlannedCall {
  if (intent.type === "recommend") {
    return { tool: "recommend", moods: intent.moods, scenes: intent.scenes };
  }
  if (intent.type === "borrow") {
    return { tool: "borrow", movieId: intent.movieId };
  }
  if (intent.type === "borrow_unresolved") {
    return { tool: "none", reason: "borrow_unresolved" };
  }
  return { tool: "none", reason: "unmatched" };
}

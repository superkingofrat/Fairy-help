import type { Mood, Scene } from "@fairy/shared";
import type { ChatIntent } from "./intentClassifier";

export type PlannedCall =
  | { tool: "recommend"; moods: Mood[]; scenes: Scene[] }
  | { tool: "borrow"; movieId: string }
  | { tool: "return"; movieId: string }
  | { tool: "none"; reason: "unmatched" | "borrow_unresolved" | "return_unresolved" | "chitchat" };

export function plan(intent: ChatIntent): PlannedCall {
  if (intent.type === "recommend") {
    return { tool: "recommend", moods: intent.moods, scenes: intent.scenes };
  }
  if (intent.type === "borrow") {
    return { tool: "borrow", movieId: intent.movieId };
  }
  if (intent.type === "return") {
    return { tool: "return", movieId: intent.movieId };
  }
  if (intent.type === "borrow_unresolved") {
    return { tool: "none", reason: "borrow_unresolved" };
  }
  if (intent.type === "return_unresolved") {
    return { tool: "none", reason: "return_unresolved" };
  }
  if (intent.type === "chitchat") {
    return { tool: "none", reason: "chitchat" };
  }
  return { tool: "none", reason: "unmatched" };
}

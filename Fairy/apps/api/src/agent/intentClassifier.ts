import { MOODS, SCENES, type Mood, type Scene } from "@fairy/shared";
import * as movieService from "../services/movieService";

export type ChatIntent =
  | { type: "borrow"; movieId: string }
  | { type: "borrow_unresolved" }
  | { type: "recommend"; moods: Mood[]; scenes: Scene[] }
  | { type: "unmatched" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMoodsAndScenes(message: string): { moods: Mood[]; scenes: Scene[] } {
  const moods = MOODS.filter((mood) => message.includes(mood));
  const scenes = SCENES.filter((scene) => message.includes(scene));
  return { moods, scenes };
}

export async function classifyIntent(input: {
  message: string;
  movieId?: string;
}): Promise<ChatIntent> {
  if (input.movieId && UUID_RE.test(input.movieId)) {
    return { type: "borrow", movieId: input.movieId };
  }

  if (input.message.includes("借")) {
    const titles = await movieService.listMoviesForTitleMatch();
    const haystack = input.message.toLowerCase();
    const matches = titles.filter((movie) => haystack.includes(movie.title.toLowerCase()));
    if (matches.length === 1) {
      return { type: "borrow", movieId: matches[0].id };
    }
    return { type: "borrow_unresolved" };
  }

  const { moods, scenes } = parseMoodsAndScenes(input.message);
  if (moods.length > 0 || scenes.length > 0) {
    return { type: "recommend", moods, scenes };
  }

  return { type: "unmatched" };
}

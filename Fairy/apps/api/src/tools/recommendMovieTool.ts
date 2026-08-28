import type { Movie, Profile } from "@fairy/shared";
import * as movieService from "../services/movieService";
import * as profileService from "../services/profileService";
import * as behaviorLogService from "../services/behaviorLogService";
import type { Mood, Scene } from "@fairy/shared";

const MAX_RESULTS = 5;

function genreOverlap(movie: Movie, likeGenres: string[]): number {
  const likes = new Set(likeGenres);
  return movie.genres.filter((genre) => likes.has(genre)).length;
}

export async function recommendMovieTool(input: {
  userId: string;
  moods: Mood[];
  scenes: Scene[];
}): Promise<{ success: boolean; data?: Movie[]; error?: string }> {
  const profile: Profile | null = await profileService.getByUserId(input.userId);
  const movies = await movieService.listMoviesForRecommend(input.moods, input.scenes);
  const likeGenres = profile?.likeGenres ?? [];

  const ranked = [...movies].sort((a, b) => {
    const scoreDiff = genreOverlap(b, likeGenres) - genreOverlap(a, likeGenres);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.title.localeCompare(b.title, "zh-CN");
  });

  const items = ranked.slice(0, MAX_RESULTS);

  if (items.length > 0) {
    await behaviorLogService.append({
      userId: input.userId,
      action: "RECOMMEND",
      payload: { movieIds: items.map((movie) => movie.id) },
    });
  }

  return { success: true, data: items };
}

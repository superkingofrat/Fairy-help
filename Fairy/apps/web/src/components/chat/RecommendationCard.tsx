import type { Movie } from "@fairy/shared";
import { t } from "../../lib/i18n";

interface RecommendationCardProps {
  movie: Movie;
  onBorrow: (movieId: string) => void;
  disabled: boolean;
}

export function RecommendationCard({
  movie,
  onBorrow,
  disabled,
}: RecommendationCardProps): JSX.Element {
  return (
    <article className="rounded border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-800">{movie.title}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {movie.year} · {movie.mood.join(" / ")} · {t("chat.stock")}: {movie.stock}
      </p>
      <button
        type="button"
        disabled={disabled || movie.stock < 1}
        onClick={() => onBorrow(movie.id)}
        className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:bg-slate-300"
      >
        {t("chat.borrow")}
      </button>
    </article>
  );
}

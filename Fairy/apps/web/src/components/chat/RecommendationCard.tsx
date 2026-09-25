import type { Movie } from "@fairy/shared";
import { t } from "../../lib/i18n";

interface RecommendationCardProps {
  movie: Movie;
  onBorrow: (movieId: string) => void;
  onReturn?: (movieId: string) => void;
  isBorrowed?: boolean;
  disabled: boolean;
}

export function RecommendationCard({
  movie,
  onBorrow,
  onReturn,
  isBorrowed = false,
  disabled,
}: RecommendationCardProps): JSX.Element {
  const borrowed = isBorrowed && onReturn !== undefined;
  const quote = movie.quote?.trim() || null;

  return (
    <article className="rounded border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-800">{movie.title}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {movie.year} · {movie.mood.join(" / ")} · {t("chat.stock")}: {movie.stock}
      </p>
      {quote ? (
        <p className="mt-2 border-l-2 border-indigo-200 pl-2 text-xs italic leading-relaxed text-slate-500">
          「{quote}」
        </p>
      ) : null}
      {borrowed ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onReturn(movie.id)}
          className="mt-3 rounded bg-amber-600 px-3 py-1.5 text-sm text-white disabled:bg-slate-300"
        >
          {t("chat.return")}
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || movie.stock < 1}
          onClick={() => onBorrow(movie.id)}
          className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:bg-slate-300"
        >
          {t("chat.borrow")}
        </button>
      )}
    </article>
  );
}

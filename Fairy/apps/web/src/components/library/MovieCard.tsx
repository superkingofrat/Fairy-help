import type { Movie } from "@fairy/shared";
import { t } from "../../lib/i18n";

export type CardStatus = "idle" | "borrowing" | "borrowed" | "error";

interface MovieCardProps {
  movie: Movie;
  status: CardStatus;
  errorMsg?: string;
  onBorrow: (movieId: string) => void;
}

export function MovieCard({ movie, status, errorMsg, onBorrow }: MovieCardProps): JSX.Element {
  const borrowDisabled = status === "borrowing" || status === "borrowed" || movie.stock < 1;
  const label =
    status === "borrowed"
      ? t("library.borrowed")
      : status === "borrowing"
        ? t("library.borrowing")
        : t("library.borrow");

  return (
    <article className="rounded border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-800">{movie.title}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {movie.year} · {movie.director}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {t("library.mood")}: {movie.mood.join(" / ")}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {t("library.scene")}: {movie.scene.join(" / ")}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {t("library.stock")}: {movie.stock}
      </p>
      <button
        type="button"
        disabled={borrowDisabled}
        onClick={() => onBorrow(movie.id)}
        className={
          status === "borrowed"
            ? "mt-3 rounded bg-slate-300 px-3 py-1.5 text-sm text-slate-600"
            : "mt-3 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:bg-slate-300"
        }
      >
        {label}
      </button>
      {status === "error" && errorMsg ? (
        <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
      ) : null}
    </article>
  );
}

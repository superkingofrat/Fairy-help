import { useEffect, useState } from "react";
import type { Movie } from "@fairy/shared";
import { t } from "../../lib/i18n";
import { borrowLabel } from "./borrowLabel";
import type { CardStatus } from "./MovieCard";

interface MovieDetailModalProps {
  movie: Movie;
  status: CardStatus;
  errorMsg?: string;
  onBorrow: (movieId: string) => void;
  onClose: () => void;
}

export function MovieDetailModal({
  movie,
  status,
  errorMsg,
  onBorrow,
  onClose,
}: MovieDetailModalProps): JSX.Element {
  const [coverFailed, setCoverFailed] = useState(false);
  const borrowDisabled = status === "borrowing" || status === "borrowed" || movie.stock < 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      data-testid="movie-detail-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("library.detail.title")}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-800">{movie.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:border-indigo-400"
          >
            {t("library.detail.close")}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          {movie.coverUrl && !coverFailed ? (
            <img
              src={movie.coverUrl}
              alt={t("library.cover.alt").replace("{title}", movie.title)}
              onError={() => setCoverFailed(true)}
              className="h-64 w-full shrink-0 rounded object-cover sm:w-48"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-64 w-full shrink-0 items-center justify-center rounded bg-gradient-to-br from-slate-200 to-slate-300 text-2xl font-semibold text-slate-500 sm:w-48"
            >
              {movie.title.slice(0, 1)}
            </div>
          )}

          <div className="flex-1 text-sm text-slate-600">
            <p>
              {movie.year} · {movie.director}
            </p>
            <p className="mt-1">
              <span className="text-slate-500">{t("library.detail.genres")}:</span>{" "}
              {movie.genres.join(" / ")}
            </p>
            <p className="mt-1">
              <span className="text-slate-500">{t("library.mood")}:</span> {movie.mood.join(" / ")}
            </p>
            <p className="mt-1">
              <span className="text-slate-500">{t("library.scene")}:</span>{" "}
              {movie.scene.join(" / ")}
            </p>
            <p className="mt-1">
              <span className="text-slate-500">{t("library.stock")}:</span> {movie.stock} /{" "}
              {movie.totalStock}
            </p>
            {movie.quote ? (
              <p className="mt-3 italic text-slate-500">
                <span className="text-slate-500">{t("library.detail.quote")}:</span>{" "}
                {`「${movie.quote}」`}
              </p>
            ) : null}
            <p className="mt-3">
              <span className="text-slate-500">{t("library.detail.description")}:</span>{" "}
              {movie.description}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            disabled={borrowDisabled}
            onClick={() => onBorrow(movie.id)}
            className={
              status === "borrowed"
                ? "rounded bg-slate-300 px-3 py-1.5 text-sm text-slate-600"
                : "rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:bg-slate-300"
            }
          >
            {borrowLabel(status)}
          </button>
          {status === "error" && errorMsg ? (
            <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

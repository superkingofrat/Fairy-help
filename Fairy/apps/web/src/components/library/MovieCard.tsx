import { useState } from "react";
import type { Movie } from "@fairy/shared";
import { t } from "../../lib/i18n";
import { borrowLabel } from "./borrowLabel";

export type CardStatus = "idle" | "borrowing" | "borrowed" | "error";

interface MovieCardProps {
  movie: Movie;
  status: CardStatus;
  errorMsg?: string;
  onBorrow: (movieId: string) => void;
  onOpenDetail?: (movie: Movie) => void;
}

export function MovieCard({
  movie,
  status,
  errorMsg,
  onBorrow,
  onOpenDetail,
}: MovieCardProps): JSX.Element {
  const borrowDisabled = status === "borrowing" || status === "borrowed" || movie.stock < 1;
  const [coverFailed, setCoverFailed] = useState(false);

  const cover =
    movie.coverUrl && !coverFailed ? (
      <img
        src={movie.coverUrl}
        alt={t("library.cover.alt").replace("{title}", movie.title)}
        loading="lazy"
        onError={() => setCoverFailed(true)}
        className="mb-3 h-44 w-full rounded object-cover"
      />
    ) : (
      <div
        aria-hidden="true"
        className="mb-3 flex h-44 w-full items-center justify-center rounded bg-gradient-to-br from-slate-200 to-slate-300 text-2xl font-semibold text-slate-500"
      >
        {movie.title.slice(0, 1)}
      </div>
    );

  const info = (
    <>
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
    </>
  );

  return (
    <article className="rounded border border-slate-200 bg-white p-4">
      {onOpenDetail ? (
        // 卡片整体作为打开详情的触发区：button 包裹标题与文字信息（含少量流式内容，
        // 浏览器均支持），换取原生键盘可达与读屏播报，无需自建 keydown 处理
        <button
          type="button"
          onClick={() => onOpenDetail(movie)}
          aria-label={t("library.openDetail").replace("{title}", movie.title)}
          className="block w-full text-left"
        >
          {cover}
          {info}
        </button>
      ) : (
        <div>
          {cover}
          {info}
        </div>
      )}
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
        {borrowLabel(status)}
      </button>
      {status === "error" && errorMsg ? (
        <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
      ) : null}
    </article>
  );
}

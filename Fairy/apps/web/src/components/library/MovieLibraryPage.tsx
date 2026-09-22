import { useCallback, useEffect, useMemo, useState } from "react";
import type { Movie, Pagination } from "@fairy/shared";
import { MOODS, SCENES } from "@fairy/shared";
import { localizedErrorMessage } from "../../lib/errorMessages";
import { t } from "../../lib/i18n";
import { borrowMovie, fetchMovies, searchMovies } from "../../lib/movieApi";
import { listRentals } from "../../lib/rentalsApi";
import { MovieCard, type CardStatus } from "./MovieCard";

const PAGE_SIZE = 12;

interface CardState {
  status: CardStatus;
  errorMsg?: string;
}

function toggleItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function MovieLibraryPage(): JSX.Element {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [moods, setMoods] = useState<string[]>([]);
  const [scenes, setScenes] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [borrowedIds, setBorrowedIds] = useState<Set<string>>(new Set());
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const filtering = useMemo(
    () => moods.length > 0 || scenes.length > 0 || keyword.trim() !== "",
    [moods, scenes, keyword],
  );

  const refreshRentals = useCallback(async () => {
    try {
      const rentals = await listRentals({ status: "ACTIVE" });
      setBorrowedIds(new Set(rentals.map((rental) => rental.movieId)));
    } catch {
      // 401 由客户端统一登出；其余情况保留现有已借标记
    }
  }, []);

  useEffect(() => {
    void refreshRentals();
  }, [refreshRentals]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const fetchPage = filtering
      ? searchMovies({
          mood: moods.join(","),
          scene: scenes.join(","),
          keyword,
          page,
          limit: PAGE_SIZE,
        })
      : fetchMovies(page, PAGE_SIZE);

    fetchPage
      .then((result) => {
        if (cancelled) return;
        setMovies(result.items);
        setPagination(result.pagination);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setLoadError(localizedErrorMessage(error, t, "library.error.load"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filtering, moods, scenes, keyword, page, refreshTick]);

  const handleBorrow = useCallback(
    async (movieId: string) => {
      setCards((prev) => ({ ...prev, [movieId]: { status: "borrowing" } }));
      setHint(null);
      try {
        await borrowMovie(movieId);
        setCards((prev) => ({ ...prev, [movieId]: { status: "borrowed" } }));
        setHint(t("library.borrowOk"));
      } catch (error) {
        const code = (error as { code?: string }).code;
        const message =
          code === "ALREADY_BORROWED"
            ? t("library.error.ALREADY_BORROWED")
            : code === "OUT_OF_STOCK"
              ? t("library.error.OUT_OF_STOCK")
              : code === "MOVIE_NOT_FOUND"
                ? t("library.error.MOVIE_NOT_FOUND")
                : localizedErrorMessage(error, t, "library.error.borrow");
        setCards((prev) => ({ ...prev, [movieId]: { status: "error", errorMsg: message } }));
      }
      void refreshRentals();
      setRefreshTick((tick) => tick + 1);
    },
    [refreshRentals],
  );

  const handleSearch = (): void => {
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  const handleReset = (): void => {
    setMoods([]);
    setScenes([]);
    setKeyword("");
    setKeywordInput("");
    setPage(1);
  };

  const chipClass = (active: boolean): string =>
    active
      ? "rounded-full bg-indigo-600 px-3 py-1 text-sm text-white"
      : "rounded-full bg-white border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:border-indigo-400";

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t("library.title")}</h1>
          <p className="text-sm text-slate-600">{t("library.subtitle")}</p>
        </div>
      </div>

      {hint ? (
        <p className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {hint}
        </p>
      ) : null}

      <section className="mt-4 rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">{t("library.mood")}:</span>
          {MOODS.map((mood) => (
            <button
              key={mood}
              type="button"
              onClick={() => {
                setMoods((prev) => toggleItem(prev, mood));
                setPage(1);
              }}
              className={chipClass(moods.includes(mood))}
            >
              {mood}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">{t("library.scene")}:</span>
          {SCENES.map((scene) => (
            <button
              key={scene}
              type="button"
              onClick={() => {
                setScenes((prev) => toggleItem(prev, scene));
                setPage(1);
              }}
              className={chipClass(scenes.includes(scene))}
            >
              {scene}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            aria-label={t("library.filters.keyword")}
            placeholder={t("library.filters.keyword")}
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white"
          >
            {t("library.filters.search")}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
          >
            {t("library.filters.reset")}
          </button>
        </div>
      </section>

      {loadError ? (
        <p className="mt-6 text-sm text-red-600">
          {t("library.error.load")}: {loadError}
        </p>
      ) : loading ? (
        <p className="mt-6 text-sm text-slate-500">{t("library.loading")}</p>
      ) : movies.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{t("library.empty")}</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {movies.map((movie) => {
              const state: CardState = cards[movie.id] ?? {
                status: borrowedIds.has(movie.id) ? "borrowed" : "idle",
              };
              return (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  status={state.status}
                  errorMsg={state.errorMsg}
                  onBorrow={handleBorrow}
                />
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {t("library.page.prev")}
            </button>
            <span className="text-sm text-slate-600">
              {t("library.page.info")
                .replace("{page}", String(pagination.page))
                .replace("{totalPages}", String(pagination.totalPages))}
            </span>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {t("library.page.next")}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

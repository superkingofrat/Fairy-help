import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MOODS,
  SCENES,
  parseCreateMovieInput,
  type CreateMovieInput,
  type Movie,
  type Mood,
  type MovieWriteField,
  type Scene,
} from "@fairy/shared";
import {
  createMovie,
  deleteMovie,
  fetchMovies,
  searchMovies,
  updateMovie,
} from "../../lib/movieApi";
import { t, type Messages } from "../../lib/i18n";

interface MovieFormState {
  title: string;
  director: string;
  year: string;
  mood: Mood[];
  scene: Scene[];
  genres: string;
  quote: string;
  stock: string;
  totalStock: string;
  coverUrl: string;
  description: string;
}

const FIELD_ERROR_KEYS: Record<MovieWriteField, keyof Messages> = {
  title: "movies.error.field.title",
  director: "movies.error.field.director",
  year: "movies.error.field.year",
  mood: "movies.error.field.mood",
  scene: "movies.error.field.scene",
  genres: "movies.error.field.genres",
  quote: "movies.error.field.quote",
  stock: "movies.error.field.stock",
  totalStock: "movies.error.field.totalStock",
  coverUrl: "movies.error.field.coverUrl",
  description: "movies.error.field.description",
};

function formatFieldErrors(fields: MovieWriteField[]): string {
  return [...new Set(fields)].map((field) => t(FIELD_ERROR_KEYS[field])).join("；");
}

const emptyForm: MovieFormState = {
  title: "",
  director: "",
  year: "",
  mood: [],
  scene: [],
  genres: "",
  quote: "",
  stock: "0",
  totalStock: "0",
  coverUrl: "",
  description: "",
};

function movieToForm(movie: Movie): MovieFormState {
  return {
    title: movie.title,
    director: movie.director,
    year: String(movie.year),
    mood: [...movie.mood],
    scene: [...movie.scene],
    genres: movie.genres.join(", "),
    quote: movie.quote ?? "",
    stock: String(movie.stock),
    totalStock: String(movie.totalStock),
    coverUrl: movie.coverUrl ?? "",
    description: movie.description,
  };
}

function formToInput(form: MovieFormState): CreateMovieInput {
  return {
    title: form.title.trim(),
    director: form.director.trim(),
    year: Number(form.year),
    mood: form.mood,
    scene: form.scene,
    genres: form.genres
      .split(",")
      .map((genre) => genre.trim())
      .filter(Boolean),
    quote: form.quote.trim() || null,
    stock: Number(form.stock),
    totalStock: Number(form.totalStock),
    coverUrl: form.coverUrl.trim() || null,
    description: form.description.trim(),
  };
}

function toggleTag<T extends string>(tags: T[], tag: T, max = 3): T[] {
  if (tags.includes(tag)) {
    return tags.filter((item) => item !== tag);
  }

  if (tags.length >= max) {
    return tags;
  }

  return [...tags, tag];
}

export function MoviesAdminPage(): JSX.Element {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [filterMood, setFilterMood] = useState("");
  const [filterScene, setFilterScene] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);
  const [form, setForm] = useState<MovieFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Movie | null>(null);

  const isSearchActive = useMemo(
    () => Boolean(keyword.trim() || filterMood || filterScene),
    [filterMood, filterScene, keyword]
  );

  const loadMovies = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = isSearchActive
        ? await searchMovies({
            keyword: keyword.trim() || undefined,
            mood: filterMood || undefined,
            scene: filterScene || undefined,
          })
        : await fetchMovies();

      setMovies(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("movies.error.load"));
      setMovies([]);
    } finally {
      setLoading(false);
    }
  }, [filterMood, filterScene, isSearchActive, keyword]);

  useEffect(() => {
    void loadMovies();
  }, [loadMovies]);

  function openCreateModal(): void {
    setEditingMovie(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(movie: Movie): void {
    setEditingMovie(movie);
    setForm(movieToForm(movie));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal(): void {
    setModalOpen(false);
    setEditingMovie(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = parseCreateMovieInput(formToInput(form));
    if (!parsed.success) {
      setFormError(formatFieldErrors(parsed.fields));
      return;
    }

    try {
      if (editingMovie) {
        await updateMovie(editingMovie.id, parsed.data);
      } else {
        await createMovie(parsed.data);
      }

      closeModal();
      await loadMovies();
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : t("movies.error.save"));
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }

    setError(null);

    try {
      await deleteMovie(deleteTarget.id);
      setDeleteTarget(null);
      await loadMovies();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("movies.error.delete"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("movies.title")}</h1>
          <p className="text-slate-600">{t("movies.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          {t("movies.actions.create")}
        </button>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={t("movies.filters.keyword")}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <select
          value={filterMood}
          onChange={(event) => setFilterMood(event.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          <option value="">{t("movies.filters.moodAll")}</option>
          {MOODS.map((mood) => (
            <option key={mood} value={mood}>
              {mood}
            </option>
          ))}
        </select>
        <select
          value={filterScene}
          onChange={(event) => setFilterScene(event.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          <option value="">{t("movies.filters.sceneAll")}</option>
          {SCENES.map((scene) => (
            <option key={scene} value={scene}>
              {scene}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void loadMovies()}
          className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-50"
        >
          {t("movies.actions.search")}
        </button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-slate-600">{t("movies.loading")}</p>
      ) : error ? null : movies.length === 0 ? (
        <p className="text-slate-600">{t("movies.empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">{t("movies.table.title")}</th>
                <th className="px-4 py-3">{t("movies.table.director")}</th>
                <th className="px-4 py-3">{t("movies.table.year")}</th>
                <th className="px-4 py-3">{t("movies.table.mood")}</th>
                <th className="px-4 py-3">{t("movies.table.scene")}</th>
                <th className="px-4 py-3">{t("movies.table.stock")}</th>
                <th className="px-4 py-3">{t("movies.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {movies.map((movie) => (
                <tr key={movie.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{movie.title}</td>
                  <td className="px-4 py-3">{movie.director}</td>
                  <td className="px-4 py-3">{movie.year}</td>
                  <td className="px-4 py-3">{movie.mood.join("、")}</td>
                  <td className="px-4 py-3">{movie.scene.join("、")}</td>
                  <td className="px-4 py-3">
                    {movie.stock}/{movie.totalStock}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(movie)}
                        className="text-indigo-600 hover:underline"
                      >
                        {t("movies.actions.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(movie)}
                        className="text-red-600 hover:underline"
                      >
                        {t("movies.actions.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-xl font-semibold">
              {editingMovie ? t("movies.modal.editTitle") : t("movies.modal.createTitle")}
            </h2>
            {formError ? <p className="mb-4 text-sm text-red-600">{formError}</p> : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                {t("movies.form.title")}
                <input
                  required
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                {t("movies.form.director")}
                <input
                  required
                  value={form.director}
                  onChange={(event) => setForm({ ...form, director: event.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                {t("movies.form.year")}
                <input
                  required
                  type="number"
                  min={1888}
                  max={2100}
                  value={form.year}
                  onChange={(event) => setForm({ ...form, year: event.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                {t("movies.form.genres")}
                <input
                  required
                  value={form.genres}
                  onChange={(event) => setForm({ ...form, genres: event.target.value })}
                  placeholder={t("movies.form.genresPlaceholder")}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                {t("movies.form.stock")}
                <input
                  required
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(event) => setForm({ ...form, stock: event.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                {t("movies.form.totalStock")}
                <input
                  required
                  type="number"
                  min={0}
                  value={form.totalStock}
                  onChange={(event) => setForm({ ...form, totalStock: event.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">{t("movies.form.mood")}</p>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        mood: toggleTag(current.mood, mood),
                      }))
                    }
                    className={`rounded-full px-3 py-1 text-sm ${
                      form.mood.includes(mood)
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-300 text-slate-700"
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">{t("movies.form.scene")}</p>
              <div className="flex flex-wrap gap-2">
                {SCENES.map((scene) => (
                  <button
                    key={scene}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        scene: toggleTag(current.scene, scene),
                      }))
                    }
                    className={`rounded-full px-3 py-1 text-sm ${
                      form.scene.includes(scene)
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-300 text-slate-700"
                    }`}
                  >
                    {scene}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block text-sm">
              {t("movies.form.quote")}
              <textarea
                value={form.quote}
                onChange={(event) => setForm({ ...form, quote: event.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                rows={2}
              />
            </label>

            <label className="mt-3 block text-sm">
              {t("movies.form.description")}
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                rows={3}
              />
            </label>

            <label className="mt-3 block text-sm">
              {t("movies.form.coverUrl")}
              <input
                value={form.coverUrl}
                onChange={(event) => setForm({ ...form, coverUrl: event.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded border border-slate-300 px-4 py-2"
              >
                {t("movies.actions.cancel")}
              </button>
              <button
                type="submit"
                className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
              >
                {t("movies.actions.save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">{t("movies.delete.title")}</h3>
            <p className="mt-2 text-slate-600">
              {t("movies.delete.message").replace("{title}", deleteTarget.title)}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded border border-slate-300 px-4 py-2"
              >
                {t("movies.actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                {t("movies.actions.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

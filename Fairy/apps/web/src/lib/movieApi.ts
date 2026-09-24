import { request } from "./http";
import type { CreateMovieInput, Movie, PaginatedMovies, UpdateMovieInput } from "@fairy/shared";

export { ApiRequestError } from "./http";

export interface BorrowResult {
  rentalId: string;
  remainingStock: number;
}

export async function borrowMovie(movieId: string): Promise<BorrowResult> {
  return request<BorrowResult>("/api/borrow", {
    method: "POST",
    body: JSON.stringify({ movieId }),
  });
}

export async function fetchMovies(page = 1, limit = 20): Promise<PaginatedMovies> {
  return request<PaginatedMovies>(`/api/movies?page=${page}&limit=${limit}`);
}

export async function searchMovies(params: {
  mood?: string;
  scene?: string;
  keyword?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedMovies> {
  const query = new URLSearchParams();
  if (params.mood) query.set("mood", params.mood);
  if (params.scene) query.set("scene", params.scene);
  if (params.keyword) query.set("keyword", params.keyword);
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  return request<PaginatedMovies>(`/api/movies/search?${query.toString()}`);
}

export async function createMovie(input: CreateMovieInput): Promise<Movie> {
  return request<Movie>("/api/movies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMovie(id: string, input: UpdateMovieInput): Promise<Movie> {
  return request<Movie>(`/api/movies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMovie(id: string): Promise<void> {
  await request<{ id: string }>(`/api/movies/${id}`, {
    method: "DELETE",
  });
}

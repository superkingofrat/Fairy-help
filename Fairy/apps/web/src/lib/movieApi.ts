import { useAuthStore } from "../stores/authStore";
import type {
  CreateMovieInput,
  Movie,
  PaginatedMovies,
  UpdateMovieInput,
} from "@fairy/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaderOption(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ApiResponse<T> {
  code: string;
  data: T;
  msg: string;
}

export class ApiRequestError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaderOption(),
      ...options.headers,
    },
  });

  const raw = await response.text();
  let payload: ApiResponse<T> | null = null;

  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as ApiResponse<T>;
    } catch {
      throw new ApiRequestError(
        response.ok
          ? "Invalid API response"
          : `Request failed (${response.status}): API returned non-JSON response. Is the API running on port 3000?`
      );
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clear();
      window.location.assign("/login");
      throw new ApiRequestError("会话已失效，请重新登录");
    }
    throw new ApiRequestError(
      payload?.msg ??
        `Request failed (${response.status}). Check that pnpm --filter=@fairy/api dev is running.`,
      payload?.code
    );
  }

  if (!payload) {
    throw new ApiRequestError(
      "Empty API response. Check that pnpm --filter=@fairy/api dev is running."
    );
  }

  return payload;
}

export interface BorrowResult {
  rentalId: string;
  remainingStock: number;
}

export async function borrowMovie(movieId: string): Promise<BorrowResult> {
  const result = await request<BorrowResult>("/api/borrow", {
    method: "POST",
    body: JSON.stringify({ movieId }),
  });
  return result.data;
}

export async function fetchMovies(page = 1, limit = 20): Promise<PaginatedMovies> {
  const result = await request<PaginatedMovies>(`/api/movies?page=${page}&limit=${limit}`);
  return result.data;
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

  const result = await request<PaginatedMovies>(`/api/movies/search?${query.toString()}`);
  return result.data;
}

export async function createMovie(input: CreateMovieInput): Promise<Movie> {
  const result = await request<Movie>("/api/movies", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function updateMovie(id: string, input: UpdateMovieInput): Promise<Movie> {
  const result = await request<Movie>(`/api/movies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function deleteMovie(id: string): Promise<void> {
  await request<{ id: string }>(`/api/movies/${id}`, {
    method: "DELETE",
  });
}

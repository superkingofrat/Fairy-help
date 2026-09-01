import type { Movie } from "./movieTypes";

export interface ChatRequest {
  message: string;
  movieId?: string;
  sessionId?: string;
  action?: "return";
}

export interface TextSseEvent {
  content: string;
}

export interface RecommendationSseEvent {
  items: Movie[];
}

export interface BorrowSseEvent {
  success: boolean;
  remainingStock: number | null;
  rentalId: string | null;
  code: string;
}

export interface DoneSseEvent {
  [key: string]: never;
}

export interface ReturnSseEvent {
  success: boolean;
  remainingStock: number | null;
  rentalId: string | null;
  code: string;
}

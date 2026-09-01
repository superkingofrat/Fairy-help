import type { Movie } from "./movieTypes";

export type SessionRole = "user" | "assistant";

export type ChatEvent =
  | { type: "recommendation"; items: Movie[] }
  | {
      type: "borrow";
      success: boolean;
      remainingStock: number | null;
      rentalId: string | null;
      code: string;
    }
  | {
      type: "return";
      success: boolean;
      remainingStock: number | null;
      rentalId: string | null;
      code: string;
    };

export interface ChatMessagePayload {
  events: ChatEvent[];
}

export interface ChatMessageDto {
  id: string;
  sessionId: string;
  role: SessionRole;
  content: string;
  payload: ChatMessagePayload | null;
  createdAt: string;
}

export interface SessionListItem {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

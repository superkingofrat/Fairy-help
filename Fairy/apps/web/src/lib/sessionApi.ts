import { request } from "./http";
import type { ChatMessageDto, SessionListItem } from "@fairy/shared";

export { ApiRequestError as SessionApiError } from "./http";

export async function listSessions(): Promise<SessionListItem[]> {
  return request<SessionListItem[]>("/api/sessions");
}

export async function createSession(): Promise<SessionListItem> {
  return request<SessionListItem>("/api/sessions", { method: "POST" });
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessageDto[]> {
  return request<ChatMessageDto[]>(`/api/sessions/${sessionId}`);
}

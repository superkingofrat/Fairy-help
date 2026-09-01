import { useAuthStore } from "../stores/authStore";
import type { ChatMessageDto, SessionListItem } from "@fairy/shared";

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

export class SessionApiError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "SessionApiError";
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
      throw new SessionApiError(
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
      throw new SessionApiError("会话已失效，请重新登录");
    }
    throw new SessionApiError(
      payload?.msg ??
        `Request failed (${response.status}). Check that pnpm --filter=@fairy/api dev is running.`,
      payload?.code
    );
  }

  if (!payload) {
    throw new SessionApiError(
      "Empty API response. Check that pnpm --filter=@fairy/api dev is running."
    );
  }

  return payload;
}

export async function listSessions(): Promise<SessionListItem[]> {
  const result = await request<SessionListItem[]>("/api/sessions");
  return result.data;
}

export async function createSession(): Promise<SessionListItem> {
  const result = await request<SessionListItem>("/api/sessions", { method: "POST" });
  return result.data;
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessageDto[]> {
  const result = await request<ChatMessageDto[]>(`/api/sessions/${sessionId}`);
  return result.data;
}

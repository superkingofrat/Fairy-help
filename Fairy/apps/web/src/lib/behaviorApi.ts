import { useAuthStore } from "../stores/authStore";
import type { BehaviorLogFeed } from "@fairy/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaderOption(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface FetchBehaviorLogsParams {
  action?: string;
  page?: number;
  limit?: number;
}

interface ApiResponse<T> {
  code: string;
  data: T;
  msg: string;
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
      throw new Error(
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
      throw new Error("会话已失效，请重新登录");
    }
    throw new Error(
      payload?.msg ??
        `Request failed (${response.status}). Check that pnpm --filter=@fairy/api dev is running.`
    );
  }

  if (!payload) {
    throw new Error("Empty API response. Check that pnpm --filter=@fairy/api dev is running.");
  }

  return payload;
}

export async function fetchBehaviorLogs(
  params: FetchBehaviorLogsParams = {}
): Promise<BehaviorLogFeed> {
  const query = new URLSearchParams();
  if (params.action) query.set("action", params.action);
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  const result = await request<BehaviorLogFeed>(`/api/behavior-logs?${query.toString()}`);
  return result.data;
}

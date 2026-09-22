import { useAuthStore } from "../stores/authStore";
import type { AuthUser } from "@fairy/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiRequestError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

export interface AuthSessionData {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

interface ApiEnvelope<T> {
  code: string;
  data: T;
  msg: string;
}

// 传输层合成错误码：API 未启动、反代挡下、断网、响应非 JSON 时后端给不出可展示的 msg，
// 用这些码让组件层映射本地化文案，而不是把英文开发提示直接显示给用户
export const TRANSPORT_ERROR_CODES = [
  "NETWORK_ERROR",
  "INVALID_RESPONSE",
  "EMPTY_RESPONSE",
  "REQUEST_FAILED",
] as const;

export async function fetchResponse(path: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, options);
  } catch (error) {
    throw new ApiRequestError(
      error instanceof Error ? error.message : "Network request failed",
      "NETWORK_ERROR",
    );
  }
}

// 解包 { code, data, msg }：解析失败、非 2xx、空体都抛出带错误码的 ApiRequestError。
// 后端 msg 优先作为 message（契约承诺其中文可展示）；合成场景保留英文开发提示于 message，
// 但码稳定，组件层按码显示本地化文案
async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const raw = await response.text();
  let payload: ApiEnvelope<T> | null = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as ApiEnvelope<T>;
    } catch {
      throw new ApiRequestError(
        response.ok
          ? "Invalid API response"
          : `Request failed (${response.status}): API returned non-JSON response. Is the API running on port 3000?`,
        "INVALID_RESPONSE",
      );
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiRequestError(payload?.msg ?? "会话已失效，请重新登录", "UNAUTHORIZED");
    }
    throw new ApiRequestError(
      payload?.msg ??
        `Request failed (${response.status}). Check that pnpm --filter=@fairy/api dev is running.`,
      payload?.code ?? "REQUEST_FAILED",
    );
  }
  if (!payload) {
    throw new ApiRequestError(
      "Empty API response. Check that pnpm --filter=@fairy/api dev is running.",
      "EMPTY_RESPONSE",
    );
  }

  return payload;
}

// 免认证 JSON 请求（登录/注册/刷新/登出），解包 { code, data, msg }
export async function rawRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchResponse(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  const payload = await readEnvelope<T>(response);
  return payload.data;
}

export async function refreshSession(refreshToken: string): Promise<AuthSessionData | null> {
  try {
    return await rawRequest<AuthSessionData>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return null;
  }
}

// 单飞刷新：并发 401 共享同一个刷新请求，避免重复调用 /refresh。
// chat 的 SSE 401 也走这里（chatApi），只返回新 token，失败由各调用方处理
let refreshInFlight: Promise<string | null> | null = null;

export function singleFlightRefresh(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) {
      return null;
    }
    const session = await refreshSession(refreshToken);
    if (!session) {
      return null;
    }
    useAuthStore.getState().setSession(session.token, session.user, session.refreshToken);
    return session.token;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function requestInner<T>(path: string, options: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const response = await fetchResponse(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const payload = await readEnvelope<T>(response);
  return payload.data;
}

// 带认证的 JSON 请求：401 时单飞刷新并重试一次，刷新失败才清登录并跳转
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await requestInner<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.code !== "UNAUTHORIZED") {
      throw error;
    }

    const newToken = await singleFlightRefresh();
    if (!newToken) {
      useAuthStore.getState().clear();
      window.location.assign("/login");
      throw error;
    }
    return requestInner<T>(path, { ...options, headers: { Authorization: `Bearer ${newToken}` } });
  }
}

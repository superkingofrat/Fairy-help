import type { AuthUser } from "@fairy/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface ApiResponse<T> {
  code: string;
  data: T;
  msg: string;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<LoginResult> | null;

  if (!response.ok || !payload || payload.code !== "OK") {
    throw new Error(payload?.msg ?? `Login failed (${response.status})`);
  }

  return payload.data;
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<AuthUser> | null;

  if (!response.ok || !payload || payload.code !== "OK") {
    throw new Error(payload?.msg ?? `Session restore failed (${response.status})`);
  }

  return payload.data;
}

import type { AuthUser } from "@fairy/shared";
import { rawRequest, refreshSession, type AuthSessionData } from "./http";

export type LoginResult = AuthSessionData;

export async function login(email: string, password: string): Promise<LoginResult> {
  return rawRequest<LoginResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string): Promise<LoginResult> {
  return rawRequest<LoginResult>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(refreshToken: string): Promise<void> {
  // 尽力而为：本地已登出，即使撤销失败也不阻塞用户
  await rawRequest<null>("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);
}

export function refresh(refreshToken: string): Promise<AuthSessionData | null> {
  return refreshSession(refreshToken);
}

export async function fetchMe(token: string): Promise<AuthUser> {
  return rawRequest<AuthUser>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

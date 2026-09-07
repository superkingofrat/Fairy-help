import type { AuthUser } from "@fairy/shared";
import { useAuthStore } from "../stores/authStore";
import { ApiRequestError, rawRequest, refreshSession, type AuthSessionData } from "./http";

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

// 启动时会话校验：本地残留 token 时先验证再渲染内部页，杜绝「内部内容先闪现、随后才跳登录」。
// 仅 401 视为会话失效（尝试一次刷新续期，失败才登出）；网络/服务异常不武断登出，交给页面自身报错。
export type BootSessionResult = "ok" | "expired";

let bootCheck: Promise<BootSessionResult> | null = null;

async function checkBootSession(): Promise<BootSessionResult> {
  const token = useAuthStore.getState().token;
  if (!token) {
    return "ok";
  }
  try {
    await fetchMe(token);
    return "ok";
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "UNAUTHORIZED") {
      const refreshToken = useAuthStore.getState().refreshToken;
      const session = refreshToken ? await refreshSession(refreshToken) : null;
      if (session) {
        useAuthStore.getState().setSession(session.token, session.user, session.refreshToken);
        return "ok";
      }
      useAuthStore.getState().clear();
      return "expired";
    }
    return "ok";
  }
}

// 模块级单飞：StrictMode 双执行 effect 时共享同一次校验，避免并发 /refresh 旋转竞争。
export function ensureSessionOnBoot(): Promise<BootSessionResult> {
  bootCheck ??= checkBootSession().finally(() => {
    bootCheck = null;
  });
  return bootCheck;
}

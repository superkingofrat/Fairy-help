import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@fairy/shared";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser, refreshToken: string) => void;
  clear: () => void;
}

type AuthChannelMessage =
  { type: "session"; token: string; user: AuthUser; refreshToken: string } | { type: "cleared" };

// 多标签会话同步：登录/刷新旋转/登出发生后广播给其余标签，
// 否则各标签的 localStorage 副本各自漂移——一个标签刚旋转拿到新 token，
// 其他标签还在用已吊销的旧 token，下一次请求照样 401
const AUTH_CHANNEL_NAME = "fairy-auth";

function createAuthChannel(): BroadcastChannel | null {
  // SSR / 不支持的运行环境（如 jsdom）没有 BroadcastChannel：静默跳过，不影响单标签使用
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(AUTH_CHANNEL_NAME);
}

const authChannel = createAuthChannel();

function broadcast(message: AuthChannelMessage): void {
  authChannel?.postMessage(message);
}

function applySession(session: { token: string; user: AuthUser; refreshToken: string }): void {
  useAuthStore.setState({
    token: session.token,
    user: session.user,
    refreshToken: session.refreshToken,
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setSession: (token, user, refreshToken) => {
        set({ token, user, refreshToken });
        broadcast({ type: "session", token, user, refreshToken });
      },
      clear: () => {
        set({ token: null, refreshToken: null, user: null });
        broadcast({ type: "cleared" });
      },
    }),
    { name: "fairy-auth" },
  ),
);

// 收到其他标签的会话消息后直接落状态。BroadcastChannel 不会回送发送方，
// 且这里绕过 setSession/clear 的广播路径，两个标签之间不会互相触发成环
authChannel?.addEventListener("message", (event: MessageEvent) => {
  const message = event.data as AuthChannelMessage;
  if (message.type === "cleared") {
    useAuthStore.setState({ token: null, refreshToken: null, user: null });
  } else {
    applySession(message);
  }
});

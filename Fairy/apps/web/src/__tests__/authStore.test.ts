import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@fairy/shared";

const user: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "user@fairy.local",
  role: "user",
};

const otherUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "admin@fairy.local",
  role: "admin",
};

interface AuthChannelMessage {
  type: "session" | "cleared";
  token?: string;
  user?: AuthUser;
  refreshToken?: string;
}

// store 在模块加载时即建频道并注册监听，每个用例都经 resetModules 换新模块实例
const channels: FakeBroadcastChannel[] = [];

class FakeBroadcastChannel {
  posted: AuthChannelMessage[] = [];
  private listeners: ((event: MessageEvent) => void)[] = [];

  constructor(readonly name: string) {
    channels.push(this);
  }

  postMessage(message: AuthChannelMessage): void {
    this.posted.push(message);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === "message") {
      this.listeners.push(listener);
    }
  }

  close(): void {}

  receive(message: AuthChannelMessage): void {
    for (const listener of this.listeners) {
      listener(new MessageEvent("message", { data: message }));
    }
  }
}

async function loadStore(): Promise<typeof import("../stores/authStore")> {
  return import("../stores/authStore");
}

beforeEach(() => {
  vi.resetModules();
  channels.length = 0;
  localStorage.clear();
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function latestChannel(): FakeBroadcastChannel {
  const channel = channels[channels.length - 1];
  if (!channel) {
    throw new Error("no channel created");
  }
  return channel;
}

describe("authStore cross-tab sync", () => {
  it("uses a dedicated channel", async () => {
    await loadStore();
    expect(channels).toHaveLength(1);
    expect(latestChannel().name).toBe("fairy-auth");
  });

  it("broadcasts the new session when setSession is called", async () => {
    const { useAuthStore } = await loadStore();

    useAuthStore.getState().setSession("t1", user, "rt1");

    expect(latestChannel().posted).toEqual([
      { type: "session", token: "t1", user, refreshToken: "rt1" },
    ]);
    expect(useAuthStore.getState().token).toBe("t1");
    expect(useAuthStore.getState().refreshToken).toBe("rt1");
  });

  it("broadcasts a cleared message when clear is called", async () => {
    const { useAuthStore } = await loadStore();
    useAuthStore.getState().setSession("t1", user, "rt1");

    useAuthStore.getState().clear();

    expect(latestChannel().posted).toEqual([
      { type: "session", token: "t1", user, refreshToken: "rt1" },
      { type: "cleared" },
    ]);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it("applies a session message from another tab without re-broadcasting", async () => {
    const { useAuthStore } = await loadStore();

    latestChannel().receive({
      type: "session",
      token: "t2",
      user: otherUser,
      refreshToken: "rt2",
    });

    expect(useAuthStore.getState().token).toBe("t2");
    expect(useAuthStore.getState().user).toEqual(otherUser);
    expect(useAuthStore.getState().refreshToken).toBe("rt2");
    expect(latestChannel().posted).toEqual([]);
  });

  it("applies a cleared message from another tab without re-broadcasting", async () => {
    const { useAuthStore } = await loadStore();
    useAuthStore.getState().setSession("t1", user, "rt1");

    latestChannel().receive({ type: "cleared" });

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(latestChannel().posted).toHaveLength(1);
  });

  it("still works when BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const { useAuthStore } = await loadStore();
    expect(channels).toHaveLength(0);

    useAuthStore.getState().setSession("t1", user, "rt1");
    expect(useAuthStore.getState().token).toBe("t1");

    useAuthStore.getState().clear();
    expect(useAuthStore.getState().token).toBeNull();
  });
});

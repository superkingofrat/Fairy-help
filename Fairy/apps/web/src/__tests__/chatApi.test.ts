import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postChat, type ParsedSseEvent } from "../lib/chatApi";
import { useAuthStore } from "../stores/authStore";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "user@fairy.local",
  role: "user",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(body: string, status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "Content-Type": "text/event-stream" } });
}

const CHAT_BODY = 'event: text\ndata: {"text":"推荐《海盗》"}\n\nevent: done\ndata: {}\n\n';

const assignMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ token: null, refreshToken: null, user: null });
});

beforeEach(() => {
  assignMock.mockReset();
  Object.defineProperty(window, "location", {
    writable: true,
    value: { assign: assignMock, href: "http://localhost/" },
  });
});

describe("postChat", () => {
  it("sends the bearer token and streams every event", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      sseResponse(CHAT_BODY),
    );
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "t", refreshToken: "rt", user });

    const events: ParsedSseEvent[] = [];
    await postChat(
      { sessionId: "00000000-0000-4000-8000-000000000001", message: "推荐一部" },
      (event) => events.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer t");
    expect(events).toEqual([
      { event: "text", data: { text: "推荐《海盗》" } },
      { event: "done", data: {} },
    ]);
  });

  it("refreshes on 401 and streams the retried request", async () => {
    let chatCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/api/auth/refresh")) {
        return jsonResponse(200, {
          code: "OK",
          data: { token: "new-token", refreshToken: "new-rt", user },
          msg: "ok",
        });
      }
      chatCalls += 1;
      return chatCalls === 1
        ? jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" })
        : sseResponse(CHAT_BODY);
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "old-token", refreshToken: "rt", user });

    const events: ParsedSseEvent[] = [];
    await postChat(
      { sessionId: "00000000-0000-4000-8000-000000000001", message: "推荐一部" },
      (event) => events.push(event),
    );

    expect(chatCalls).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 原请求 + refresh + 重试
    const [, retryInit] = fetchMock.mock.calls[2];
    expect((retryInit?.headers as Record<string, string>).Authorization).toBe("Bearer new-token");
    expect(events.map((event) => event.event)).toEqual(["text", "done"]);
    expect(useAuthStore.getState().token).toBe("new-token");
    expect(useAuthStore.getState().refreshToken).toBe("new-rt");
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("shares one refresh across concurrent 401 chats", async () => {
    let chatCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/api/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, {
          code: "OK",
          data: { token: "new-token", refreshToken: "new-rt", user },
          msg: "ok",
        });
      }
      chatCalls += 1;
      return chatCalls <= 2
        ? jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "失效" })
        : sseResponse(CHAT_BODY);
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "old-token", refreshToken: "rt", user });

    const send = (): Promise<void> =>
      postChat(
        { sessionId: "00000000-0000-4000-8000-000000000001", message: "推荐一部" },
        () => {},
      );
    await Promise.all([send(), send()]);

    expect(refreshCalls).toBe(1);
    expect(chatCalls).toBe(4);
  });

  it("clears the session and redirects when refresh fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/refresh")) {
        return jsonResponse(401, {
          code: "INVALID_REFRESH_TOKEN",
          data: null,
          msg: "登录状态已过期",
        });
      }
      return jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" });
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "old-token", refreshToken: "rt", user });

    await expect(
      postChat(
        { sessionId: "00000000-0000-4000-8000-000000000001", message: "推荐一部" },
        () => {},
      ),
    ).rejects.toThrow("会话已失效，请重新登录");
    expect(fetchMock).toHaveBeenCalledTimes(2); // 原请求 + refresh，不重试
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it("gives up when the retried chat is unauthorized again", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/refresh")) {
        return jsonResponse(200, {
          code: "OK",
          data: { token: "new-token", refreshToken: "new-rt", user },
          msg: "ok",
        });
      }
      return jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" });
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "old-token", refreshToken: "rt", user });

    await expect(
      postChat(
        { sessionId: "00000000-0000-4000-8000-000000000001", message: "推荐一部" },
        () => {},
      ),
    ).rejects.toThrow("会话已失效，请重新登录");
    expect(fetchMock).toHaveBeenCalledTimes(3); // 原请求 + refresh + 重试仍 401
    expect(useAuthStore.getState().token).toBeNull();
    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it("passes non-401 failures through without refreshing", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(500, { code: "INTERNAL", data: null, msg: "" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "t", refreshToken: "rt", user });

    await expect(
      postChat(
        { sessionId: "00000000-0000-4000-8000-000000000001", message: "推荐一部" },
        () => {},
      ),
    ).rejects.toThrow('{"code":"INTERNAL","data":null,"msg":""}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().token).toBe("t");
    expect(assignMock).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSessionOnBoot } from "../lib/authApi";
import { ApiRequestError, request } from "../lib/http";
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

describe("http request client", () => {
  it("sends the bearer token and returns the unwrapped data", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { code: "OK", data: { items: [] }, msg: "ok" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "t", refreshToken: "rt", user });

    const data = await request<{ items: string[] }>("/api/movies");

    expect(data).toEqual({ items: [] });
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer t");
  });

  it("refreshes once on 401 and retries the original request", async () => {
    let moviesCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/auth/refresh")) {
        return jsonResponse(200, {
          code: "OK",
          data: { token: "new-token", refreshToken: "new-rt", user },
          msg: "ok",
        });
      }
      moviesCalls += 1;
      return moviesCalls === 1
        ? jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" })
        : jsonResponse(200, { code: "OK", data: { items: [1] }, msg: "ok" });
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "old-token", refreshToken: "rt", user });

    const data = await request<{ items: number[] }>("/api/movies");

    expect(data).toEqual({ items: [1] });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 原请求 + refresh + 重试
    expect(useAuthStore.getState().token).toBe("new-token");
    expect(useAuthStore.getState().refreshToken).toBe("new-rt");
  });

  it("shares a single in-flight refresh across concurrent 401s", async () => {
    let moviesCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, {
          code: "OK",
          data: { token: "new-token", refreshToken: "new-rt", user },
          msg: "ok",
        });
      }
      moviesCalls += 1;
      return moviesCalls <= 2
        ? jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" })
        : jsonResponse(200, { code: "OK", data: { items: [] }, msg: "ok" });
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "old-token", refreshToken: "rt", user });

    const [a, b] = await Promise.all([
      request<{ items: unknown[] }>("/api/movies?a=1"),
      request<{ items: unknown[] }>("/api/movies?b=1"),
    ]);

    expect(a).toEqual({ items: [] });
    expect(b).toEqual({ items: [] });
    expect(refreshCalls).toBe(1);
  });

  it("clears the session and redirects to login when refresh fails", async () => {
    let moviesCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/auth/refresh")) {
        return jsonResponse(401, {
          code: "INVALID_REFRESH_TOKEN",
          data: null,
          msg: "登录状态已过期",
        });
      }
      moviesCalls += 1;
      return jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" });
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "old-token", refreshToken: "rt", user });

    await expect(request<{ items: unknown[] }>("/api/movies")).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(assignMock).toHaveBeenCalledWith("/login");
    expect(moviesCalls).toBe(1);
  });

  it("clears the session when 401 fires without a refresh token", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "t", refreshToken: null, user });

    await expect(request<{ items: unknown[] }>("/api/movies")).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(useAuthStore.getState().token).toBeNull();
    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it("passes through non-401 API errors with the backend message", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(409, { code: "EMAIL_ALREADY_EXISTS", data: null, msg: "该邮箱已注册" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "t", refreshToken: "rt", user });

    const error = await request<unknown>("/api/movies").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).message).toBe("该邮箱已注册");
    expect((error as ApiRequestError).code).toBe("EMAIL_ALREADY_EXISTS");
    expect(assignMock).not.toHaveBeenCalled();
  });
});

describe("boot session check (ensureSessionOnBoot)", () => {
  it("skips validation and stays ready when no token is stored", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: null, refreshToken: null, user: null });

    await expect(ensureSessionOnBoot()).resolves.toBe("ok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a still-valid access token via /api/auth/me", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/auth/me");
      return jsonResponse(200, { code: "OK", data: user, msg: "ok" });
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "t", refreshToken: "rt", user });

    await expect(ensureSessionOnBoot()).resolves.toBe("ok");
    expect(useAuthStore.getState().token).toBe("t");
  });

  it("refreshes once when the access token expired and keeps the session", async () => {
    let meCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/auth/refresh")) {
        return jsonResponse(200, {
          code: "OK",
          data: { token: "new-token", refreshToken: "new-rt", user },
          msg: "ok",
        });
      }
      meCalls += 1;
      return jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" });
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "old-token", refreshToken: "rt", user });

    await expect(ensureSessionOnBoot()).resolves.toBe("ok");
    expect(meCalls).toBe(1);
    expect(useAuthStore.getState().token).toBe("new-token");
    expect(useAuthStore.getState().refreshToken).toBe("new-rt");
  });

  it("clears the stored session when refresh also fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/auth/refresh")) {
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

    await expect(ensureSessionOnBoot()).resolves.toBe("expired");
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("clears the stored session on 401 when no refresh token exists", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { code: "UNAUTHORIZED", data: null, msg: "会话已失效" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "t", refreshToken: null, user });

    await expect(ensureSessionOnBoot()).resolves.toBe("expired");
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("keeps the session when the API is unreachable instead of force-logging-out", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "t", refreshToken: "rt", user });

    await expect(ensureSessionOnBoot()).resolves.toBe("ok");
    expect(useAuthStore.getState().token).toBe("t");
  });
});

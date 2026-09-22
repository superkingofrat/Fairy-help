import type { BorrowSseEvent, ChatRequest, Movie, RecommendationSseEvent } from "@fairy/shared";
import { ApiRequestError, fetchResponse, singleFlightRefresh } from "./http";
import { useAuthStore } from "../stores/authStore";

export interface ParsedSseEvent {
  event: string;
  data: unknown;
}

export function parseSseBuffer(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const events: ParsedSseEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    let eventName = "message";
    let dataLine = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLine = line.slice("data:".length).trim();
      }
    }
    if (!dataLine) {
      continue;
    }
    events.push({ event: eventName, data: JSON.parse(dataLine) as unknown });
  }

  return { events, rest };
}

// 401 专用：与网络错误、流错误区分开，触发刷新重试
class ChatAuthExpiredError extends Error {
  constructor() {
    super("chat unauthorized");
    this.name = "ChatAuthExpiredError";
  }
}

interface ChatErrorEnvelope {
  code?: string;
  msg?: string;
}

// 开启 SSE 前的后端错误响应：解出 { code, msg }，带码上抛。
// 组件层按码映射 chat.error.* 本地化文案（lib/errorMessages），
// 不把原始 JSON、英文提示或 i18n key 字面量直接显示给用户
function parseChatError(raw: string): ChatErrorEnvelope | null {
  if (!raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw) as ChatErrorEnvelope;
  } catch {
    return null;
  }
}

export async function postChat(
  body: ChatRequest,
  onEvent: (event: ParsedSseEvent) => void,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<void> {
  const controller = options?.signal ? undefined : new AbortController();
  const signal = options?.signal ?? controller?.signal;
  const timeout = options?.timeoutMs ?? 60_000;

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller?.abort();
  }, timeout);

  const expireSession = (): never => {
    useAuthStore.getState().clear();
    window.location.assign("/login");
    throw new ApiRequestError("session expired", "SESSION_EXPIRED");
  };

  const send = async (): Promise<void> => {
    // 每次尝试都重新读 token：刷新可能已被并发请求或其它标签页完成
    const token = useAuthStore.getState().token;
    const response = await fetchResponse("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new ChatAuthExpiredError();
      }
      const payload = parseChatError(await response.text());
      throw new ApiRequestError(
        payload?.msg ?? `Chat failed (${response.status})`,
        payload?.code ?? "CHAT_FAILED",
      );
    }

    if (!response.body) {
      throw new ApiRequestError("empty chat stream", "EMPTY_STREAM");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // 流读取循环：无测试条件的 for 等价于 while (true)，但不受 no-constant-condition 约束
    for (;;) {
      if (timedOut) {
        throw new ApiRequestError("chat request timed out", "TIMEOUT");
      }
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        // 超时中止会把 pending read 拒绝为 AbortError，按 timedOut 归一为 TIMEOUT；
        // 调用方主动取消原样抛出；其余流中断归 STREAM
        if (timedOut) {
          throw new ApiRequestError("chat request timed out", "TIMEOUT");
        }
        if (options?.signal?.aborted) {
          throw error;
        }
        throw new ApiRequestError("chat stream failed", "STREAM");
      }
      if (chunk.done) {
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        onEvent(event);
      }
    }
  };

  try {
    try {
      await send();
    } catch (error) {
      if (!(error instanceof ChatAuthExpiredError)) {
        throw error;
      }
      // 401：访问令牌可能刚过期，走与普通请求共享的单飞刷新，成功后重试一次
      if (await singleFlightRefresh()) {
        try {
          await send();
          return;
        } catch (retryError) {
          if (!(retryError instanceof ChatAuthExpiredError)) {
            throw retryError;
          }
        }
      }
      expireSession();
    }
  } finally {
    clearTimeout(timer);
  }
}

export type { BorrowSseEvent, RecommendationSseEvent, Movie };

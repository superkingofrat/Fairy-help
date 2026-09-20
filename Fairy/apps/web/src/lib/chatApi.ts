import type { BorrowSseEvent, ChatRequest, Movie, RecommendationSseEvent } from "@fairy/shared";
import { useAuthStore } from "../stores/authStore";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

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

export async function postChat(
  body: ChatRequest,
  onEvent: (event: ParsedSseEvent) => void,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<void> {
  const token = useAuthStore.getState().token;
  const controller = options?.signal ? undefined : new AbortController();
  const signal = options?.signal ?? controller?.signal;
  const timeout = options?.timeoutMs ?? 60_000;

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller?.abort();
  }, timeout);

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
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
        useAuthStore.getState().clear();
        window.location.assign("/login");
        throw new Error("会话已失效，请重新登录");
      }
      const raw = await response.text();
      throw new Error(raw || `Chat failed (${response.status})`);
    }

    if (!response.body) {
      throw new Error("Empty chat stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      if (timedOut) {
        throw new Error("chat.error.timeout");
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        onEvent(event);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

export type { BorrowSseEvent, RecommendationSseEvent, Movie };

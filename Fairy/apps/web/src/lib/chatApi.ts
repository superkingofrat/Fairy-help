import type { BorrowSseEvent, ChatRequest, Movie, RecommendationSseEvent } from "@fairy/shared";

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
  onEvent: (event: ParsedSseEvent) => void
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dev-Role": "user",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
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
}

export type { BorrowSseEvent, RecommendationSseEvent, Movie };

import { parseSseBuffer, type ParsedSseEvent } from "../lib/chatApi";

export function useSseParser(): {
  consume: (chunk: string) => ParsedSseEvent[];
  reset: () => void;
} {
  let buffer = "";

  return {
    consume(chunk: string): ParsedSseEvent[] {
      const parsed = parseSseBuffer(buffer + chunk);
      buffer = parsed.rest;
      return parsed.events;
    },
    reset(): void {
      buffer = "";
    },
  };
}

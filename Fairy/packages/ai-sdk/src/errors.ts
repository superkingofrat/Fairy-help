import type { AiProviderName } from "./types.js";

export type AiProviderErrorCode =
  | "MISSING_API_KEY"
  | "UNKNOWN_PROVIDER"
  | "TIMEOUT"
  | "HTTP_5XX"
  | "RATE_LIMITED"
  | "PARSE"
  | "EMBED_UNSUPPORTED";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly provider: AiProviderName | "unknown";

  constructor(code: AiProviderErrorCode, provider: AiProviderName | "unknown", message: string) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.provider = provider;
  }
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}

export function isMissingApiKeyError(error: unknown): boolean {
  return isAiProviderError(error) && error.code === "MISSING_API_KEY";
}

import { AiProviderError } from "./errors";
import { createClaudeProvider } from "./providers/claudeProvider";
import { createOpenAiCompatibleProvider } from "./providers/openaiProvider";
import type { AiProvider, AiProviderName } from "./types";

export const PROVIDER_DEFAULT_MODELS: Record<AiProviderName, string> = {
  deepseek: "deepseek-v4-flash",
  openai: "gpt-4o-mini",
  claude: "claude-3-5-haiku-latest",
};

const API_KEY_VARS: Record<AiProviderName, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
};

const BASE_URL_VARS: Record<AiProviderName, string> = {
  deepseek: "DEEPSEEK_BASE_URL",
  openai: "OPENAI_BASE_URL",
  claude: "ANTHROPIC_BASE_URL",
};

const DEFAULT_BASE_URLS: Record<AiProviderName, string> = {
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
  claude: "https://api.anthropic.com",
};

const DEFAULT_TIMEOUT_MS = 20000;

export function isAiProviderName(value: string): value is AiProviderName {
  return value === "deepseek" || value === "openai" || value === "claude";
}

export interface CreateAiProviderOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export function createAiProvider(options: CreateAiProviderOptions = {}): AiProvider {
  const env = options.env ?? process.env;

  const rawName = env.AI_PROVIDER?.trim() || "deepseek";
  if (!isAiProviderName(rawName)) {
    throw new AiProviderError(
      "UNKNOWN_PROVIDER",
      "unknown",
      `Unknown AI_PROVIDER "${rawName}". Expected deepseek, openai, or claude.`
    );
  }

  const apiKey = env[API_KEY_VARS[rawName]]?.trim();
  if (!apiKey) {
    throw new AiProviderError(
      "MISSING_API_KEY",
      rawName,
      `Missing ${API_KEY_VARS[rawName]} for AI_PROVIDER=${rawName}`
    );
  }

  const defaultModel = env.AI_MODEL?.trim() || PROVIDER_DEFAULT_MODELS[rawName];
  const baseUrl = env[BASE_URL_VARS[rawName]]?.trim() || DEFAULT_BASE_URLS[rawName];
  const timeoutValue = Number(env.AI_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : DEFAULT_TIMEOUT_MS;

  if (rawName === "claude") {
    return createClaudeProvider({
      apiKey,
      baseUrl,
      defaultModel,
      timeoutMs,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }

  return createOpenAiCompatibleProvider({
    name: rawName,
    apiKey,
    baseUrl,
    defaultModel,
    timeoutMs,
    embeddingsSupported: rawName === "openai",
    ...(rawName === "openai" ? { defaultEmbeddingModel: "text-embedding-3-small" } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}

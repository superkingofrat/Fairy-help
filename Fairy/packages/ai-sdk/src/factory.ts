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

// 默认超时必须容纳 reasoning 模型的「思考」耗时：默认供应商 deepseek-v4-flash 的思考与答案
// 共用同一次请求，实测单次行程草稿 raw 耗时 11-25s。20000ms 会把其中一部分 abort 掉，而
// abort 抛的是 TIMEOUT、经上层归一后呈现为 PARSE「Provider returned malformed JSON」——
// 日志看起来像供应商返回了损坏响应，实为超时，极具误导性。60000 与本地实测可用值一致。
const DEFAULT_TIMEOUT_MS = 60000;

// FU-16：独立可选 embed 配置——与 AI_PROVIDER 解耦（DeepSeek/Claude 无 embeddings API，
// 但默认 chat 供应商是 deepseek 时仍可经 OpenAI embed）。缺 key 时 createEmbeddingProvider 返回 null（降级信号）。
export const EMBEDDING_DEFAULT_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

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
      `Unknown AI_PROVIDER "${rawName}". Expected deepseek, openai, or claude.`,
    );
  }

  const apiKey = env[API_KEY_VARS[rawName]]?.trim();
  if (!apiKey) {
    throw new AiProviderError(
      "MISSING_API_KEY",
      rawName,
      `Missing ${API_KEY_VARS[rawName]} for AI_PROVIDER=${rawName}`,
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

export interface CreateEmbeddingProviderOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

/**
 * FU-16：创建独立于 AI_PROVIDER 的 embed 客户端（仅 OpenAI 供应商有 embeddings API）。
 * 密钥取 `EMBEDDING_API_KEY`，缺省回退 `OPENAI_API_KEY`；模型取 `EMBEDDING_MODEL`（默认
 * text-embedding-3-small，1536 维）。两者都未配置时返回 null——消费方按「无 embed 能力」
 * 降级为结构化检索，不得抛 typed missing-key（否则会打断 deepseek chat 链路）。
 */
export function createEmbeddingProvider(
  options: CreateEmbeddingProviderOptions = {},
): AiProvider | null {
  const env = options.env ?? process.env;

  const apiKey = env.EMBEDDING_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = env.EMBEDDING_MODEL?.trim() || EMBEDDING_DEFAULT_MODEL;
  const baseUrl =
    env.EMBEDDING_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URLS.openai;
  const timeoutValue = Number(env.AI_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : DEFAULT_TIMEOUT_MS;

  return createOpenAiCompatibleProvider({
    name: "openai",
    apiKey,
    baseUrl,
    defaultModel: model,
    timeoutMs,
    embeddingsSupported: true,
    defaultEmbeddingModel: model,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}

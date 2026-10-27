export { AiProviderError, isAiProviderError, isMissingApiKeyError } from "./errors.js";
export type { AiProviderErrorCode } from "./errors.js";
export {
  createAiProvider,
  createEmbeddingProvider,
  isAiProviderName,
  PROVIDER_DEFAULT_MODELS,
  EMBEDDING_DEFAULT_MODEL,
  EMBEDDING_DIMENSIONS,
  type CreateAiProviderOptions,
  type CreateEmbeddingProviderOptions,
} from "./factory.js";
export * from "./providers/index.js";
export { parseSseBlocks } from "./streaming.js";
export type { SseBlock } from "./streaming.js";
export type {
  AiProvider,
  AiProviderName,
  ChatMessage,
  ChatRequest,
  ChatResult,
  EmbedRequest,
  EmbedResult,
  StreamChunk,
  UsageMetadata,
} from "./types.js";

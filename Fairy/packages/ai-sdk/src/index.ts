export { AiProviderError, isAiProviderError, isMissingApiKeyError } from "./errors";
export type { AiProviderErrorCode } from "./errors";
export {
  createAiProvider,
  createEmbeddingProvider,
  isAiProviderName,
  PROVIDER_DEFAULT_MODELS,
  EMBEDDING_DEFAULT_MODEL,
  EMBEDDING_DIMENSIONS,
  type CreateAiProviderOptions,
  type CreateEmbeddingProviderOptions,
} from "./factory";
export * from "./providers";
export { parseSseBlocks } from "./streaming";
export type { SseBlock } from "./streaming";
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
} from "./types";

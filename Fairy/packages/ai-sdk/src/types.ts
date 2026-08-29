export type AiProviderName = "deepseek" | "openai" | "claude";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface UsageMetadata {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  text: string;
  usage: UsageMetadata;
  model: string;
  provider: AiProviderName;
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "done"; usage: UsageMetadata; model: string };

export interface EmbedRequest {
  input: string | string[];
  model?: string;
}

export interface EmbedResult {
  vectors: number[][];
  usage: UsageMetadata;
  model: string;
}

export interface AiProvider {
  readonly name: AiProviderName;
  readonly defaultModel: string;
  chat(request: ChatRequest): Promise<ChatResult>;
  stream(request: ChatRequest): AsyncIterable<StreamChunk>;
  embed(request: EmbedRequest): Promise<EmbedResult>;
}

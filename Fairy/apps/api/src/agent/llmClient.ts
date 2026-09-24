import {
  createAiProvider,
  isAiProviderError,
  type AiProvider,
  type ChatMessage,
  type ChatResult,
  type UsageMetadata,
} from "@fairy/ai-sdk";
import { recordUsage } from "./usage";
import { stripControlChars } from "./sanitize";

const MAX_INPUT_CHARS = 2000;

export function sanitizeUserInput(message: string): string {
  return stripControlChars(message).trim().slice(0, MAX_INPUT_CHARS);
}

let cachedProvider: AiProvider | null | undefined;

export function getLlmProvider(): AiProvider | null {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  const configured =
    process.env.AI_PROVIDER ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY;

  if (!configured) {
    cachedProvider = null;
    return cachedProvider;
  }

  try {
    cachedProvider = createAiProvider();
  } catch (error) {
    if (isAiProviderError(error)) {
      console.warn(
        JSON.stringify({ source: "llmClient", code: error.code, provider: error.provider }),
      );
    }
    cachedProvider = null;
  }

  return cachedProvider;
}

export function resetLlmProviderForTests(): void {
  cachedProvider = undefined;
}

export interface TryChatOptions {
  maxTokens?: number;
  temperature?: number;
}

const NULL_USAGE: UsageMetadata = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
};

function logProviderWarn(_source: string, error: unknown): void {
  if (isAiProviderError(error)) {
    console.warn(
      JSON.stringify({ source: "llmClient", code: error.code, provider: error.provider }),
    );
  } else {
    console.warn(JSON.stringify({ source: "llmClient", code: "UNKNOWN" }));
  }
}

// 供 onDelta 使用的流式通道：逐 chunk 回调增量文本，返回累计结果。
// 流中途失败但已输出部分文本时，返回已累计文本（客户端已收到，不能再用模板重复补写）；
// 一 chunk 都没产出时返回 null，由调用方回退 provider.chat() / 模板。
async function streamFromProvider(
  source: string,
  provider: AiProvider,
  messages: ChatMessage[],
  options: TryChatOptions | undefined,
  onDelta: (delta: string) => void,
): Promise<ChatResult | null> {
  let text = "";
  let usage: UsageMetadata = NULL_USAGE;
  let model: string | null = null;
  try {
    for await (const chunk of provider.stream({
      messages,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    })) {
      if (chunk.type === "text") {
        text += chunk.text;
        onDelta(chunk.text);
      } else {
        usage = chunk.usage;
        model = chunk.model;
      }
    }
  } catch (error) {
    logProviderWarn(source, error);
    if (text.length === 0) {
      return null;
    }
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  recordUsage(source, usage);
  return {
    text: trimmed,
    usage,
    model: model ?? provider.defaultModel,
    provider: provider.name,
  };
}

export async function tryChat(
  source: string,
  messages: ChatMessage[],
  options?: TryChatOptions,
  onDelta?: (delta: string) => void,
): Promise<ChatResult | null> {
  const provider = getLlmProvider();
  if (!provider) {
    return null;
  }

  if (onDelta) {
    const streamed = await streamFromProvider(source, provider, messages, options, onDelta);
    if (streamed) {
      return streamed;
    }
    // 流式不可用（无输出即失败）：回退一次性 chat()，输出形状不变
  }

  try {
    const result = await provider.chat({
      messages,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    });
    recordUsage(source, result.usage);
    return result;
  } catch (error) {
    logProviderWarn(source, error);
    return null;
  }
}

import {
  createAiProvider,
  isAiProviderError,
  type AiProvider,
  type ChatMessage,
  type ChatResult,
} from "@fairy/ai-sdk";
import { recordUsage } from "./usage";

const MAX_INPUT_CHARS = 2000;

export function sanitizeUserInput(message: string): string {
  return message
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_INPUT_CHARS);
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
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({ source: "llmClient", code: error.code, provider: error.provider })
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

export async function tryChat(
  source: string,
  messages: ChatMessage[],
  options?: TryChatOptions
): Promise<ChatResult | null> {
  const provider = getLlmProvider();
  if (!provider) {
    return null;
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
    if (isAiProviderError(error)) {
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({ source: "llmClient", code: error.code, provider: error.provider })
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({ source: "llmClient", code: "UNKNOWN" }));
    }
    return null;
  }
}

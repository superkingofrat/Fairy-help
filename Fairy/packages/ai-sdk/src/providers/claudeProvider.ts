import { AiProviderError } from "../errors";
import { parseSseBlocks } from "../streaming";
import type {
  AiProvider,
  ChatMessage,
  ChatRequest,
  ChatResult,
  EmbedRequest,
  EmbedResult,
  StreamChunk,
} from "../types";

export interface ClaudeConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

interface ClaudeWireMessages {
  system: string | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

function toClaudeMessages(messages: ChatMessage[]): ClaudeWireMessages {
  let system: string | null = null;
  const wire: ClaudeWireMessages["messages"] = [];

  for (const message of messages) {
    if (message.role === "system") {
      system = system ? `${system}\n${message.content}` : message.content;
    } else {
      wire.push({ role: message.role, content: message.content });
    }
  }

  return { system, messages: wire };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function createClaudeProvider(config: ClaudeConfig): AiProvider {
  const buildSignal = (): { signal: AbortSignal; cleanup: () => void } => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(new AiProviderError("TIMEOUT", "claude", "Provider request timed out")),
      config.timeoutMs,
    );
    return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
  };

  const postJson = async (
    path: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Response> => {
    const fetchImpl = config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(`${config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error instanceof AiProviderError && error.code === "TIMEOUT") {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new AiProviderError("TIMEOUT", "claude", "Provider request timed out");
      }
      throw new AiProviderError(
        "PARSE",
        "claude",
        "Provider request failed before a response arrived",
      );
    }

    if (response.status === 429) {
      throw new AiProviderError("RATE_LIMITED", "claude", "Provider rate limit reached");
    }
    if (response.status >= 500) {
      throw new AiProviderError("HTTP_5XX", "claude", "Provider server error");
    }
    if (!response.ok) {
      throw new AiProviderError("PARSE", "claude", "Provider rejected the request");
    }

    return response;
  };

  return {
    name: "claude",
    defaultModel: config.defaultModel,

    async chat(request: ChatRequest): Promise<ChatResult> {
      const model = request.model ?? config.defaultModel;
      const { system, messages } = toClaudeMessages(request.messages);
      const { signal, cleanup } = buildSignal();
      try {
        const response = await postJson(
          "/v1/messages",
          {
            model,
            max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(system ? { system } : {}),
            messages,
          },
          signal,
        );

        let payload: Record<string, unknown>;
        try {
          payload = (await response.json()) as Record<string, unknown>;
        } catch {
          throw new AiProviderError("PARSE", "claude", "Provider returned malformed JSON");
        }

        const content = payload.content;
        if (!Array.isArray(content)) {
          throw new AiProviderError("PARSE", "claude", "Provider response has no content");
        }

        const text = content
          .map((block) => (block as Record<string, unknown>).text)
          .filter((part): part is string => typeof part === "string")
          .join("");

        const usage = (payload.usage ?? {}) as Record<string, unknown>;
        const promptTokens = num(usage.input_tokens);
        const completionTokens = num(usage.output_tokens);

        return {
          text,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens:
              promptTokens !== null && completionTokens !== null
                ? promptTokens + completionTokens
                : null,
          },
          model,
          provider: "claude",
        };
      } finally {
        cleanup();
      }
    },

    async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
      const model = request.model ?? config.defaultModel;
      const { system, messages } = toClaudeMessages(request.messages);
      const { signal, cleanup } = buildSignal();
      try {
        const response = await postJson(
          "/v1/messages",
          {
            model,
            max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            stream: true,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(system ? { system } : {}),
            messages,
          },
          signal,
        );

        if (!response.body) {
          throw new AiProviderError("PARSE", "claude", "Provider stream has no body");
        }

        let promptTokens: number | null = null;
        let completionTokens: number | null = null;

        for await (const block of parseSseBlocks(response.body)) {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(block.data) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (payload.type === "content_block_delta") {
            const delta = payload.delta as Record<string, unknown> | undefined;
            if (typeof delta?.text === "string" && delta.text.length > 0) {
              yield { type: "text", text: delta.text };
            }
          } else if (payload.type === "message_start") {
            const message = payload.message as Record<string, unknown> | undefined;
            const usage = (message?.usage ?? {}) as Record<string, unknown>;
            promptTokens = num(usage.input_tokens);
          } else if (payload.type === "message_delta") {
            const usage = (payload.usage ?? {}) as Record<string, unknown>;
            completionTokens = num(usage.output_tokens);
          }
        }

        yield {
          type: "done",
          usage: {
            promptTokens,
            completionTokens,
            totalTokens:
              promptTokens !== null && completionTokens !== null
                ? promptTokens + completionTokens
                : null,
          },
          model,
        };
      } finally {
        cleanup();
      }
    },

    async embed(_request: EmbedRequest): Promise<EmbedResult> {
      throw new AiProviderError(
        "EMBED_UNSUPPORTED",
        "claude",
        "This provider has no embeddings API",
      );
    },
  };
}

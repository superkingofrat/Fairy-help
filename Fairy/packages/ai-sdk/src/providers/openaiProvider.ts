import { AiProviderError } from "../errors";
import { parseSseBlocks } from "../streaming";
import type {
  AiProvider,
  AiProviderName,
  ChatRequest,
  ChatResult,
  EmbedRequest,
  EmbedResult,
  StreamChunk,
  UsageMetadata,
} from "../types";

export interface OpenAiCompatibleConfig {
  name: AiProviderName;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  timeoutMs: number;
  embeddingsSupported: boolean;
  defaultEmbeddingModel?: string;
  fetchImpl?: typeof fetch;
}

const EMPTY_USAGE: UsageMetadata = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
};

function parseUsage(raw: unknown): UsageMetadata {
  if (typeof raw !== "object" || raw === null) {
    return EMPTY_USAGE;
  }

  const record = raw as Record<string, unknown>;
  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    promptTokens: num(record.prompt_tokens),
    completionTokens: num(record.completion_tokens),
    totalTokens: num(record.total_tokens),
  };
}

async function postJson(
  config: OpenAiCompatibleConfig,
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const fetchImpl = config.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof AiProviderError && error.code === "TIMEOUT") {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError("TIMEOUT", config.name, "Provider request timed out");
    }
    throw new AiProviderError(
      "PARSE",
      config.name,
      "Provider request failed before a response arrived",
    );
  }

  if (response.status === 429) {
    throw new AiProviderError("RATE_LIMITED", config.name, "Provider rate limit reached");
  }
  if (response.status >= 500) {
    throw new AiProviderError("HTTP_5XX", config.name, "Provider server error");
  }
  if (!response.ok) {
    throw new AiProviderError("PARSE", config.name, "Provider rejected the request");
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new AiProviderError("PARSE", config.name, "Provider returned malformed JSON");
  }
}

export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): AiProvider {
  const buildSignal = (): { signal: AbortSignal; cleanup: () => void } => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(new AiProviderError("TIMEOUT", config.name, "Provider request timed out")),
      config.timeoutMs,
    );
    return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
  };

  return {
    name: config.name,
    defaultModel: config.defaultModel,

    async chat(request: ChatRequest): Promise<ChatResult> {
      const model = request.model ?? config.defaultModel;
      const { signal, cleanup } = buildSignal();
      try {
        const payload = (await postJson(
          config,
          "/chat/completions",
          {
            model,
            messages: request.messages,
            ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          },
          signal,
        )) as Record<string, unknown>;

        const choices = payload.choices;
        const first = Array.isArray(choices) ? choices[0] : undefined;
        const message = (first as Record<string, unknown> | undefined)?.message;
        const text = (message as Record<string, unknown> | undefined)?.content;
        if (typeof text !== "string") {
          throw new AiProviderError(
            "PARSE",
            config.name,
            "Provider response has no message content",
          );
        }

        return { text, usage: parseUsage(payload.usage), model, provider: config.name };
      } finally {
        cleanup();
      }
    },

    async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
      const model = request.model ?? config.defaultModel;
      const { signal, cleanup } = buildSignal();
      try {
        const fetchImpl = config.fetchImpl ?? fetch;
        let response: Response;
        try {
          response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: request.messages,
              stream: true,
              stream_options: { include_usage: true },
              ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
              ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            }),
            signal,
          });
        } catch (error) {
          if (error instanceof AiProviderError && error.code === "TIMEOUT") {
            throw error;
          }
          if (error instanceof Error && error.name === "AbortError") {
            throw new AiProviderError("TIMEOUT", config.name, "Provider request timed out");
          }
          throw new AiProviderError(
            "PARSE",
            config.name,
            "Provider request failed before a response arrived",
          );
        }

        if (!response.ok || !response.body) {
          throw new AiProviderError(
            response.status === 429
              ? "RATE_LIMITED"
              : response.status >= 500
                ? "HTTP_5XX"
                : "PARSE",
            config.name,
            "Provider stream request failed",
          );
        }

        let usage = EMPTY_USAGE;
        for await (const block of parseSseBlocks(response.body)) {
          if (block.data === "[DONE]") {
            break;
          }
          let chunk: Record<string, unknown>;
          try {
            chunk = JSON.parse(block.data) as Record<string, unknown>;
          } catch {
            throw new AiProviderError(
              "PARSE",
              config.name,
              "Provider stream returned malformed JSON",
            );
          }
          const chunkUsage = parseUsage(chunk.usage);
          if (chunkUsage.totalTokens !== null || chunkUsage.promptTokens !== null) {
            usage = chunkUsage;
          }
          const delta = (Array.isArray(chunk.choices) ? chunk.choices[0] : undefined) as
            Record<string, unknown> | undefined;
          const deltaContent = (delta?.delta as Record<string, unknown> | undefined)?.content;
          if (typeof deltaContent === "string" && deltaContent.length > 0) {
            yield { type: "text", text: deltaContent };
          }
        }

        yield { type: "done", usage, model };
      } finally {
        cleanup();
      }
    },

    async embed(request: EmbedRequest): Promise<EmbedResult> {
      if (!config.embeddingsSupported) {
        throw new AiProviderError(
          "EMBED_UNSUPPORTED",
          config.name,
          "This provider has no embeddings API",
        );
      }

      const model = request.model ?? config.defaultEmbeddingModel ?? "text-embedding-3-small";
      const { signal, cleanup } = buildSignal();
      try {
        const payload = (await postJson(
          config,
          "/embeddings",
          { model, input: request.input },
          signal,
        )) as Record<string, unknown>;

        const data = payload.data;
        if (!Array.isArray(data)) {
          throw new AiProviderError(
            "PARSE",
            config.name,
            "Provider embeddings response has no data",
          );
        }

        const vectors = data.map((item) => {
          const embedding = (item as Record<string, unknown> | undefined)?.embedding;
          if (!Array.isArray(embedding)) {
            throw new AiProviderError(
              "PARSE",
              config.name,
              "Provider embeddings response malformed",
            );
          }
          return embedding as number[];
        });

        return { vectors, usage: parseUsage(payload.usage), model };
      } finally {
        cleanup();
      }
    },
  };
}

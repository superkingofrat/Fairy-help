import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError } from "./errors";
import {
  createAiProvider,
  createEmbeddingProvider,
  EMBEDDING_DEFAULT_MODEL,
  isAiProviderName,
  PROVIDER_DEFAULT_MODELS,
} from "./factory";
import type { ChatMessage } from "./types";

const messages: ChatMessage[] = [
  { role: "system", content: "你是 Fairy。" },
  { role: "user", content: "雨天推荐" },
];

const deepseekEnv: Record<string, string> = {
  DEEPSEEK_API_KEY: "sk-ds",
  AI_TIMEOUT_MS: "5000",
};
const claudeEnv: Record<string, string> = {
  AI_PROVIDER: "claude",
  ANTHROPIC_API_KEY: "sk-an",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function sseResponse(blocks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const block of blocks) {
        controller.enqueue(encoder.encode(block));
      }
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

describe("isAiProviderName", () => {
  it("accepts the three known providers", () => {
    expect(isAiProviderName("deepseek")).toBe(true);
    expect(isAiProviderName("openai")).toBe(true);
    expect(isAiProviderName("claude")).toBe(true);
    expect(isAiProviderName("mistral")).toBe(false);
  });
});

describe("createAiProvider factory", () => {
  it("defaults to deepseek with its default model", () => {
    const provider = createAiProvider({ env: deepseekEnv });
    expect(provider.name).toBe("deepseek");
    expect(provider.defaultModel).toBe(PROVIDER_DEFAULT_MODELS.deepseek);
  });

  it("throws a typed missing-key error when the provider key is absent", () => {
    try {
      createAiProvider({ env: { AI_PROVIDER: "claude" } });
      expect.fail("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).code).toBe("MISSING_API_KEY");
    }
  });

  it("rejects unknown provider names", () => {
    expect(() =>
      createAiProvider({
        env: { AI_PROVIDER: "mistral", DEEPSEEK_API_KEY: "x" },
      }),
    ).toThrow(AiProviderError);
  });

  it("honours AI_MODEL override", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: "hi" } }], usage: {} }),
      );
    const provider = createAiProvider({
      env: { ...deepseekEnv, AI_MODEL: "my-model" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.chat({ messages });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.model).toBe("my-model");
  });
});

describe("openai-compatible chat (deepseek)", () => {
  it("posts to the deepseek chat endpoint with bearer auth", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "雨天适合《千与千寻》" } }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      }),
    );
    const provider = createAiProvider({
      env: deepseekEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.chat({
      messages,
      maxTokens: 200,
      temperature: 0,
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-ds",
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(PROVIDER_DEFAULT_MODELS.deepseek);
    expect(body.max_tokens).toBe(200);
    expect(body.messages).toHaveLength(2);

    expect(result.text).toBe("雨天适合《千与千寻》");
    expect(result.usage).toEqual({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    });
    expect(result.provider).toBe("deepseek");
  });

  it("maps vendor failures to typed errors without leaking bodies", async () => {
    const provider = createAiProvider({
      env: deepseekEnv,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "secret-detail" }, 500),
        ) as unknown as typeof fetch,
    });

    try {
      await provider.chat({ messages });
      expect.fail("should throw");
    } catch (error) {
      expect((error as AiProviderError).code).toBe("HTTP_5XX");
      expect((error as AiProviderError).message).not.toContain("secret-detail");
    }
  });

  it("maps 429 to RATE_LIMITED", async () => {
    const provider = createAiProvider({
      env: deepseekEnv,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(jsonResponse({}, 429)) as unknown as typeof fetch,
    });

    try {
      await provider.chat({ messages });
      expect.fail("should throw");
    } catch (error) {
      expect((error as AiProviderError).code).toBe("RATE_LIMITED");
    }
  });
});

describe("openai-compatible stream", () => {
  it("yields text chunks then a done chunk with usage", async () => {
    const blocks = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
      "data: [DONE]\n\n",
    ];
    const provider = createAiProvider({
      env: deepseekEnv,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(sseResponse(blocks)) as unknown as typeof fetch,
    });

    const chunks = [];
    for await (const chunk of provider.stream({ messages })) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toEqual({ type: "text", text: "你" });
    expect(chunks[1]).toEqual({ type: "text", text: "好" });
    expect(chunks[2]).toEqual({
      type: "done",
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
      model: PROVIDER_DEFAULT_MODELS.deepseek,
    });
  });
});

describe("embed support matrix", () => {
  it("openai provider embeds via /embeddings", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ embedding: [0.1, 0.2] }],
        usage: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 },
      }),
    );
    const provider = createAiProvider({
      env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-oa" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.embed({ input: "hello" });

    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/embeddings",
    );
    expect(result.vectors).toEqual([[0.1, 0.2]]);
  });

  it("deepseek and claude reject embed with a typed error", async () => {
    const deepseek = createAiProvider({ env: deepseekEnv });
    const claude = createAiProvider({ env: claudeEnv });

    await expect(deepseek.embed({ input: "x" })).rejects.toMatchObject({
      code: "EMBED_UNSUPPORTED",
    });
    await expect(claude.embed({ input: "x" })).rejects.toMatchObject({
      code: "EMBED_UNSUPPORTED",
    });
  });
});

describe("createEmbeddingProvider (FU-16 optional embed client)", () => {
  it("returns null when neither EMBEDDING_API_KEY nor OPENAI_API_KEY is set", () => {
    const provider = createEmbeddingProvider({
      env: { DEEPSEEK_API_KEY: "sk-ds" },
    });
    expect(provider).toBeNull();
  });

  it("falls back to OPENAI_API_KEY and embeds while chat provider is deepseek", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ embedding: [0.1, 0.2] }],
        usage: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 },
      }),
    );
    const provider = createEmbeddingProvider({
      env: {
        AI_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "sk-ds",
        OPENAI_API_KEY: "sk-oa",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("openai");

    const result = await provider?.embed({ input: "hello" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-oa",
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(EMBEDDING_DEFAULT_MODEL);
    expect(result?.vectors).toEqual([[0.1, 0.2]]);
  });

  it("prefers EMBEDDING_API_KEY and honours EMBEDDING_MODEL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ embedding: [0.3, 0.4] }], usage: {} }),
      );
    const provider = createEmbeddingProvider({
      env: {
        EMBEDDING_API_KEY: "sk-embed",
        OPENAI_API_KEY: "sk-oa",
        EMBEDDING_MODEL: "text-embedding-3-large",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider?.embed({ input: "x" });

    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-embed",
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("text-embedding-3-large");
  });
});

describe("claude provider", () => {
  it("sends system top-level and maps usage tokens", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [{ type: "text", text: "你好呀" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
    const provider = createAiProvider({
      env: claudeEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.chat({ messages, maxTokens: 300 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-an");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("你是 Fairy。");
    expect(body.messages).toEqual([{ role: "user", content: "雨天推荐" }]);
    expect(body.max_tokens).toBe(300);

    expect(result.text).toBe("你好呀");
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it("streams content_block_delta text and finishes with usage", async () => {
    const blocks = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"嗨"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n',
    ];
    const provider = createAiProvider({
      env: claudeEnv,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(sseResponse(blocks)) as unknown as typeof fetch,
    });

    const chunks = [];
    for await (const chunk of provider.stream({ messages })) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toEqual({ type: "text", text: "嗨" });
    expect(chunks[1]).toEqual({
      type: "done",
      usage: { promptTokens: 9, completionTokens: 3, totalTokens: 12 },
      model: PROVIDER_DEFAULT_MODELS.claude,
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

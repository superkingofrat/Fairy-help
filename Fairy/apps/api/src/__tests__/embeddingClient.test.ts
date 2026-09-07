import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmbeddingProvider,
  EMBEDDING_DIMENSIONS,
  type AiProvider,
} from "@fairy/ai-sdk";

// embeddingClient 的 memoize 缓存是模块级单例：用 resetModules + 动态 import 让每个用例拿到全新缓存。
vi.mock("@fairy/ai-sdk", () => ({
  createEmbeddingProvider: vi.fn(),
  EMBEDDING_DIMENSIONS: 1536,
}));

type EmbedContent = (text: string) => Promise<number[] | null>;

function fakeProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    name: "openai",
    defaultModel: "text-embedding-3-small",
    chat: vi.fn(),
    stream: vi.fn(),
    embed: vi.fn(),
    ...overrides,
  } as unknown as AiProvider;
}

const vectorOf = (dimensions: number): number[] =>
  Array.from({ length: dimensions }, (_, i) => i);

describe("embeddingClient.embedContent (FU-16)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when no embedding provider is configured (no key)", async () => {
    vi.mocked(createEmbeddingProvider).mockReturnValue(null);

    const { embedContent } = (await import("../memory/embeddingClient")) as {
      embedContent: EmbedContent;
    };

    await expect(embedContent("喜欢科幻片")).resolves.toBeNull();
  });

  it("returns the 1536-dim vector on success", async () => {
    const vector = vectorOf(EMBEDDING_DIMENSIONS);
    vi.mocked(createEmbeddingProvider).mockReturnValue(
      fakeProvider({ embed: vi.fn().mockResolvedValue({ vectors: [vector] }) }),
    );

    const { embedContent } = (await import("../memory/embeddingClient")) as {
      embedContent: EmbedContent;
    };

    await expect(embedContent("喜欢科幻片")).resolves.toEqual(vector);
  });

  it("degrades to null and logs when the provider returns a non-1536-dim vector", async () => {
    vi.mocked(createEmbeddingProvider).mockReturnValue(
      fakeProvider({
        embed: vi.fn().mockResolvedValue({ vectors: [vectorOf(512)] }),
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { embedContent } = (await import("../memory/embeddingClient")) as {
      embedContent: EmbedContent;
    };

    await expect(embedContent("喜欢科幻片")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`expected ${EMBEDDING_DIMENSIONS}, got 512`),
    );
    warn.mockRestore();
  });

  it("degrades to null and logs when the provider call fails", async () => {
    vi.mocked(createEmbeddingProvider).mockReturnValue(
      fakeProvider({
        embed: vi.fn().mockRejectedValue(new Error("upstream 429")),
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { embedContent } = (await import("../memory/embeddingClient")) as {
      embedContent: EmbedContent;
    };

    await expect(embedContent("喜欢科幻片")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("upstream 429"));
    warn.mockRestore();
  });
});

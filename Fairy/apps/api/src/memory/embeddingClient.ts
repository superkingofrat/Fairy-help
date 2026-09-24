import { createEmbeddingProvider, EMBEDDING_DIMENSIONS, type AiProvider } from "@fairy/ai-sdk";

// FU-16：向量召回 embed 客户端——可选能力，与对话主模型解耦（独立 EMBEDDING_API_KEY/EMBEDDING_MODEL）。
// 未配置 key 时 createEmbeddingProvider() 返回 null（降级信号）：调用方走结构化检索，行为与 FU-14 完全一致。
// 静默降级契约：embedContent 只可能返回 number[] 或 null，绝不向上抛错、不阻塞对话链路。

let cachedProvider: AiProvider | null | undefined;

function embeddingProvider(): AiProvider | null {
  if (cachedProvider === undefined) {
    cachedProvider = createEmbeddingProvider();
  }
  return cachedProvider;
}

/** 对单条文本生成 1536 维向量；无 key / embed 失败 / 维度不符 → null（仅记日志）。 */
export async function embedContent(text: string): Promise<number[] | null> {
  const provider = embeddingProvider();
  if (!provider) {
    return null;
  }
  try {
    const { vectors } = await provider.embed({ input: text });
    const vector = vectors[0];
    if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
      console.warn(
        `[memory-embedding] dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${vector?.length ?? 0}`,
      );
      return null;
    }
    return vector;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[memory-embedding] embed failed: ${message}`);
    return null;
  }
}

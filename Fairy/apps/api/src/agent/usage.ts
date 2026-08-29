import type { UsageMetadata } from "@fairy/ai-sdk";

export function recordUsage(source: string, usage: UsageMetadata): void {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      source,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      at: new Date().toISOString(),
    })
  );
}

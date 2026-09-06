import type { MemoryRecord } from "@fairy/shared";

// FU-14：会话历史与记忆注入的格式化。
// 近期会话历史（buildConversationHistory）由 sessionService 提供；【记忆】区块（buildMemoryBlock）
// 由记忆中心检索结果构成。两段共存注入 prompt；二期将统一由记忆中心负责检索、排序与窗口管理。

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export function buildConversationHistory(turns: HistoryTurn[]): string {
  if (turns.length === 0) {
    return "";
  }
  return turns
    .map((turn) => `${turn.role === "user" ? "用户" : "Fairy"}：${turn.content}`)
    .join("\n");
}

export function buildMemoryBlock(memories: MemoryRecord[]): string {
  if (memories.length === 0) {
    return "";
  }
  const lines = memories
    .map((memory) => `- [${memory.kind}] ${memory.content}`)
    .join("\n");
  return `【记忆】\n${lines}`;
}

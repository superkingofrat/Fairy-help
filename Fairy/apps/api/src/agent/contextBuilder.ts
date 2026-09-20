import type { MemoryRecord } from "@fairy/shared";

// FU-14：会话历史与记忆注入的格式化。
// prompt token 预算：记忆优先级高于历史，超预算时只裁剪历史尾部。

const MAX_PROMPT_TOKENS = 4000;

// 粗略 token 估算：混合中英文场景下字符/ token ≈ 3.5
// 足够作为保护阈值，无需引入 tiktoken 等重型依赖。
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// 裁剪历史使 prompt 不超出预算：记忆不裁剪，只从历史尾部截断。
export function trimHistoryToBudget(
  historyText: string,
  memoryBlock: string
): string {
  const memoryTokens = estimateTokens(memoryBlock);
  const budget = MAX_PROMPT_TOKENS - memoryTokens;
  if (budget <= 0) {
    // 记忆本身已超预算：极端情况，历史全丢
    return "";
  }
  const totalTokens = estimateTokens(historyText);
  if (totalTokens <= budget) {
    return historyText;
  }
  // 二分查找最大不超过 budget 的前缀长度
  let lo = 0;
  let hi = historyText.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (estimateTokens(historyText.slice(0, mid)) <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const trimmed = historyText.slice(0, lo);
  // 保留最后一条完整 turn（避免截断最后一条消息的半句话）
  const lastNewline = trimmed.lastIndexOf("\n");
  if (lastNewline > 0) {
    return trimmed.slice(0, lastNewline);
  }
  return trimmed;
}

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

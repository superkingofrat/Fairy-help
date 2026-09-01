// TODO(memory-center): 会话历史直接内联注入 prompt（临时方案，AGENTS §6 允许并已登记 PROJECT_STATUS 技术债）。
// 未来由记忆中心统一负责检索、排序与上下文窗口管理后，本模块的取数与格式化将整体被替换。
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

// 不可信文本消毒：prompt 注入防护的第一道闸。
// 历史与记忆是往期用户输入的原文，控制字符可用来伪造 prompt 结构、破坏日志可读性，一律剥离。
// \t \n \r 保留——当前消息内的合法换行由上层按跨度策略处理。

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function stripControlChars(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

import { memoryExtractionSchema, type MemoryExtraction } from "@fairy/shared";
import { sanitizeUserInput, tryChat } from "../agent/llmClient";
import * as memoryService from "./memoryService";

// FU-14：记忆抽取——每轮对话完成后，LLM 从（用户消息 + Fairy 回复）抽取值得记住的要点。
// 静默降级：LLM 不可用/超时/非法 JSON → 返回空数组，绝不抛错、不阻塞对话链路。

const EXTRACT_SYSTEM_PROMPT = `你是 Fairy 的记忆抽取模块。只输出一个 JSON 对象，不要输出任何解释或代码块标记。
JSON 格式：{"memories":[{"kind":"preference|fact|intent","content":"一句话要点"}]}
规则：
- 从对话中抽取值得长期记住的信息：preference 是用户的偏好/喜好（如「喜欢科幻片」「不吃辣」）；fact 是用户陈述的客观事实（如「家住上海」）；intent 是用户明确想做的事（如「想周末去杭州玩」）
- 没有值得记住的信息时输出 {"memories":[]}
- content 用一句话自然中文表述，不要编造对话中没有的信息`;

const extractJson = (text: string): unknown => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
};

// 抽取 + 落库一体入口：任何一步失败都静默返回（对话功能不受影响）。
export async function extractAndStoreMemories(input: {
  profileId: string;
  sessionId?: string;
  userMessage: string;
  replyText: string;
}): Promise<void> {
  const memories = await extractMemories(input.userMessage, input.replyText);
  if (memories.length === 0) {
    return;
  }
  for (const memory of memories) {
    await memoryService
      .addMemory({
        profileId: input.profileId,
        sessionId: input.sessionId,
        kind: memory.kind,
        content: memory.content,
      })
      .catch(() => undefined);
  }
}

export async function extractMemories(
  userMessage: string,
  replyText: string
): Promise<MemoryExtraction["memories"]> {
  const user = sanitizeUserInput(userMessage);
  if (!user) {
    return [];
  }
  const reply = replyText.trim().slice(0, 500);
  const messages = [
    { role: "system" as const, content: EXTRACT_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `用户：「${user}」\nFairy 回复：「${reply}」`,
    },
  ];
  // 低温度提高结构化输出稳定性；单次尝试即可，失败静默降级（每轮都会再抽）
  const result = await tryChat("agent.memory", messages, {
    maxTokens: 400,
    temperature: 0.2,
  });
  if (!result) {
    return [];
  }
  const parsed = memoryExtractionSchema.safeParse(extractJson(result.text));
  return parsed.success ? parsed.data.memories : [];
}

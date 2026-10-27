import { memoryExtractionSchema, type MemoryExtraction } from "@fairy/shared";
import { sanitizeUserInput, tryChat } from "../agent/llmClient.js";
import * as memoryService from "./memoryService.js";
import * as profileService from "../services/profileService.js";

// FU-14：记忆抽取——每轮对话完成后，LLM 从（用户消息 + Fairy 回复）抽取值得记住的要点。
// 静默降级：LLM 不可用/超时/非法 JSON → 返回空数组，绝不抛错、不阻塞对话链路。
// FU-18：同一 JSON 额外产出顶层 genres（片型候选 ≤3）；本轮 ≥1 条 preference 记忆真实落库且
// 候选非空时，旁路 mergeLikeGenres 回写 Profile.likeGenres（白名单过滤在 profileService 侧）。

const EXTRACT_SYSTEM_PROMPT = `你是 Fairy 的记忆抽取模块。只输出一个 JSON 对象，不要输出任何解释或代码块标记。
JSON 格式：{"genres":["片型"],"memories":[{"kind":"preference|fact|intent","content":"一句话要点"}]}
规则：
- 从对话中抽取值得长期记住的信息：preference 是用户的偏好/喜好（如「喜欢科幻片」「不吃辣」）；fact 是用户陈述的客观事实（如「家住上海」）；intent 是用户明确想做的事（如「想周末去杭州玩」）
- 没有值得记住的信息时输出 {"memories":[]}
- genres 仅当用户在本轮明确表达影片类型偏好时输出对应片型（如「爱看科幻」→ 科幻），最多 3 个；未提及影片偏好时省略该字段
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

// 抽取 + 落库 + 回写一体入口：任何一步失败都静默返回（对话功能不受影响）。
export async function extractAndStoreMemories(input: {
  profileId: string;
  sessionId?: string;
  userMessage: string;
  replyText: string;
}): Promise<void> {
  const extraction = await extractTurn(input.userMessage, input.replyText);
  if (extraction.memories.length === 0) {
    return;
  }

  // FU-18 门禁：回写只发生在“本轮确有 preference 记忆成功落库”时（AC-1：落库的偏好记忆）。
  let storedPreference = false;
  for (const memory of extraction.memories) {
    const stored = await memoryService
      .addMemory({
        profileId: input.profileId,
        sessionId: input.sessionId,
        kind: memory.kind,
        content: memory.content,
      })
      .then(() => true)
      .catch(() => false);
    if (stored && memory.kind === "preference") {
      storedPreference = true;
    }
  }

  const genres = extraction.genres ?? [];
  if (storedPreference && genres.length > 0) {
    await profileService.mergeLikeGenres(input.profileId, genres).catch(() => undefined);
  }
}

export async function extractMemories(
  userMessage: string,
  replyText: string,
): Promise<MemoryExtraction["memories"]> {
  const extraction = await extractTurn(userMessage, replyText);
  return extraction.memories;
}

// 完整抽取结果（memories + genres）；失败一律降级为“无内容”而非抛错。extractMemories 仅取 memories。
async function extractTurn(userMessage: string, replyText: string): Promise<MemoryExtraction> {
  const user = sanitizeUserInput(userMessage);
  if (!user) {
    return { memories: [] };
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
    return { memories: [] };
  }
  const parsed = memoryExtractionSchema.safeParse(extractJson(result.text));
  return parsed.success ? parsed.data : { memories: [] };
}

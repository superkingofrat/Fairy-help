import { z } from "zod";
import { MOODS, SCENES, type Mood, type Scene } from "@fairy/shared";
import * as movieService from "../services/movieService";
import { sanitizeUserInput, tryChat } from "./llmClient";

export type ChatIntent =
  | { type: "borrow"; movieId: string }
  | { type: "borrow_unresolved" }
  | { type: "return"; movieId: string }
  | { type: "return_unresolved" }
  | { type: "recommend"; moods: Mood[]; scenes: Scene[] }
  | { type: "chitchat" }
  | { type: "unmatched" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTENT_SYSTEM_PROMPT = `你是录像带门店助理 Fairy 的意图理解模块。只输出一个 JSON 对象，不要输出任何解释或代码块标记。
JSON 格式：{"intent":"borrow|return|recommend|chitchat","movieTitle":string|null,"moods":string[],"scenes":string[]}
规则：
- 用户想借某部影片 → intent=borrow，movieTitle 填影片名（没有片名则填 null）
- 用户明确要归还某部影片 → intent=return，movieTitle 填影片名（没有片名则填 null）。注意「还」有 hái/huán 两个意思，仅在用户明确表达归还影片时输出 return，不要把「还可以」「还是」当成归还
- 用户想看电影推荐、或表达了心情/场景 → intent=recommend，moods/scenes 只从下面的枚举中选
- 纯问候、与电影无关的闲聊 → intent=chitchat，movieTitle 填 null，moods/scenes 填空数组
心情枚举：${MOODS.join("、")}
场景枚举：${SCENES.join("、")}
口语映射参考：emo/想哭/难过→致郁；睡不着/失眠→失眠夜；治愈/温暖→治愈；放松→轻松；约会/浪漫→浪漫；一个人在家→独自在家；通勤/路上→通勤路上。拿不准就选最接近的枚举，宁缺毋滥。`;

const llmIntentSchema = z.object({
  intent: z.enum(["borrow", "return", "recommend", "chitchat"]),
  movieTitle: z.string().nullish(),
  moods: z.array(z.string()).nullish(),
  scenes: z.array(z.string()).nullish(),
});

type LlmIntent = z.infer<typeof llmIntentSchema>;

function extractJson(text: string): unknown {
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
}

function toValidatedEnums(
  values: string[] | null | undefined,
  allowed: readonly string[]
): string[] {
  if (!values) {
    return [];
  }
  return [...new Set(values.filter((value) => allowed.includes(value)))];
}

async function resolveTitleToId(title: string): Promise<string | null> {
  const titles = await movieService.listMoviesForTitleMatch();
  const needle = title.toLowerCase();
  const exact = titles.filter((movie) => movie.title.toLowerCase() === needle);
  const partial = titles.filter((movie) => movie.title.toLowerCase().includes(needle));
  const matches = exact.length > 0 ? exact : partial;

  return matches.length === 1 ? matches[0].id : null;
}

async function classifyIntentWithLlm(
  message: string,
  history?: string
): Promise<ChatIntent | null> {
  const text = sanitizeUserInput(message);
  if (!text) {
    return null;
  }

  const historyLine = history ? `对话历史：\n${history}\n\n` : "";
  const result = await tryChat(
    "agent.intent",
    [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: `${historyLine}用户说：「${text}」` },
    ],
    { maxTokens: 200, temperature: 0 }
  );
  if (!result) {
    return null;
  }

  const parsed = llmIntentSchema.safeParse(extractJson(result.text));
  if (!parsed.success) {
    return null;
  }
  const data: LlmIntent = parsed.data;

  if (data.intent === "chitchat") {
    return { type: "chitchat" };
  }

  if (data.intent === "borrow") {
    const title = data.movieTitle?.trim();
    if (!title) {
      return { type: "borrow_unresolved" };
    }
    const movieId = await resolveTitleToId(title);
    return movieId ? { type: "borrow", movieId } : { type: "borrow_unresolved" };
  }

  if (data.intent === "return") {
    const title = data.movieTitle?.trim();
    if (!title) {
      return { type: "return_unresolved" };
    }
    const movieId = await resolveTitleToId(title);
    return movieId ? { type: "return", movieId } : { type: "return_unresolved" };
  }

  const moods = toValidatedEnums(data.moods, MOODS) as Mood[];
  const scenes = toValidatedEnums(data.scenes, SCENES) as Scene[];
  if (moods.length === 0 && scenes.length === 0) {
    return null;
  }
  return { type: "recommend", moods, scenes };
}

export function parseMoodsAndScenes(message: string): { moods: Mood[]; scenes: Scene[] } {
  const moods = MOODS.filter((mood) => message.includes(mood));
  const scenes = SCENES.filter((scene) => message.includes(scene));
  return { moods, scenes };
}

export async function classifyIntentByRules(message: string): Promise<ChatIntent> {
  if (message.includes("借")) {
    const titles = await movieService.listMoviesForTitleMatch();
    const haystack = message.toLowerCase();
    const matches = titles.filter((movie) => haystack.includes(movie.title.toLowerCase()));
    if (matches.length === 1) {
      return { type: "borrow", movieId: matches[0].id };
    }
    return { type: "borrow_unresolved" };
  }

  if (message.includes("还")) {
    const titles = await movieService.listMoviesForTitleMatch();
    const haystack = message.toLowerCase();
    const matches = titles.filter((movie) => haystack.includes(movie.title.toLowerCase()));
    if (matches.length === 1) {
      return { type: "return", movieId: matches[0].id };
    }
    // 零/多匹配不判 return（「还」字 hái/huán 歧义，宁缺毋滥），继续走后续链
  }

  const { moods, scenes } = parseMoodsAndScenes(message);
  if (moods.length > 0 || scenes.length > 0) {
    return { type: "recommend", moods, scenes };
  }

  return { type: "unmatched" };
}

export async function classifyIntent(input: {
  message: string;
  movieId?: string;
  history?: string;
}): Promise<ChatIntent> {
  if (input.movieId && UUID_RE.test(input.movieId)) {
    return { type: "borrow", movieId: input.movieId };
  }

  const llm = await classifyIntentWithLlm(input.message, input.history);
  if (llm) {
    return llm;
  }

  return classifyIntentByRules(input.message);
}

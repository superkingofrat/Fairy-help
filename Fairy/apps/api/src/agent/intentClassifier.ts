import { z } from "zod";
import {
  MOODS,
  SCENES,
  INSIGHT_TOPICS,
  type Mood,
  type Scene,
  type InsightTopic,
} from "@fairy/shared";
import * as movieService from "../services/movieService";
import { sanitizeUserInput, tryChat } from "./llmClient";
import { trimHistoryToBudget, wrapUntrustedSpan } from "./contextBuilder";

export type ChatIntent =
  | { type: "borrow"; movieId: string }
  | { type: "borrow_unresolved" }
  | { type: "return"; movieId: string }
  | { type: "return_unresolved" }
  | { type: "recommend"; moods: Mood[]; scenes: Scene[] }
  | { type: "store_insight"; topic: InsightTopic }
  | { type: "plan_trip" }
  | { type: "chitchat" }
  | { type: "unmatched" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTENT_SYSTEM_PROMPT = `你是录像带门店助理 Fairy 的意图理解模块。只输出一个 JSON 对象，不要输出任何解释或代码块标记。
JSON 格式：{"intent":"borrow|return|recommend|store_insight|plan_trip|chitchat","movieTitle":string|null,"moods":string[],"scenes":string[],"topic":"popular|trend|inventory|mood_scene|activity|overview"}
规则：
- 用户想借某部影片 → intent=borrow，movieTitle 填影片名（没有片名则填 null）。只要含具体影片借阅意图，即使同时提到运营词也优先 borrow
- 用户明确要归还某部影片 → intent=return，movieTitle 填影片名（没有片名则填 null）。注意「还」有 hái/huán 两个意思，仅在用户明确表达归还影片时输出 return，不要把「还可以」「还是」当成归还
- 用户想看电影推荐、或表达了心情/场景 → intent=recommend，moods/scenes 只从下面的枚举中选
- 用户询问店内运营数据（什么片最火、借阅趋势、库存情况、心情/场景分布、活跃用户等）→ intent=store_insight，topic 从 popular|trend|inventory|mood_scene|activity|overview 中选：最火/热门/畅销→popular；趋势/走势/最近借阅→trend；库存/缺货/断货→inventory；心情/场景/分布→mood_scene；活跃/注册/用户数→activity；店况/运营/数据/看板/总览→overview；拿不准填 overview。示例：「最近什么片最火」→popular；「店里库存怎么样」→inventory；「店况怎么样」→overview；「最近借阅情况」→trend
- 用户要规划旅行/行程（去某地玩、旅行、旅游、出游、想去哪里、安排行程等）→ intent=plan_trip，示例：「帮我规划周末去杭州玩」→plan_trip。注意用户问的是旅行题材的影片或影片推荐（如「有没有旅行为主题的片子」）时应判 recommend，不要判成 plan_trip
- 纯问候、与电影无关的闲聊 → intent=chitchat，movieTitle 填 null，moods/scenes 填空数组
心情枚举：${MOODS.join("、")}
场景枚举：${SCENES.join("、")}
口语映射参考：emo/想哭/难过→致郁；睡不着/失眠→失眠夜；治愈/温暖→治愈；放松→轻松；约会/浪漫→浪漫；一个人在家→独自在家；通勤/路上→通勤路上。拿不准就选最接近的枚举，宁缺毋滥。`;

const llmIntentSchema = z.object({
  intent: z.enum(["borrow", "return", "recommend", "store_insight", "plan_trip", "chitchat"]),
  movieTitle: z.string().nullish(),
  moods: z.array(z.string()).nullish(),
  scenes: z.array(z.string()).nullish(),
  topic: z.string().nullish(),
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
  allowed: readonly string[],
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
  history?: string,
): Promise<ChatIntent | null> {
  const text = sanitizeUserInput(message);
  if (!text) {
    return null;
  }

  // 意图分类与合成路径同样受 token 预算约束：stateLoop 的 synthesize 三路已裁剪历史，
  // 此处补齐 classifyIntent 的注入路径（记忆未参与意图分类，budget 全额给历史）。
  const historySpan = history
    ? `${wrapUntrustedSpan("对话历史", trimHistoryToBudget(history, ""))}\n`
    : "";
  const result = await tryChat(
    "agent.intent",
    [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: `${historySpan}${wrapUntrustedSpan("用户消息", text)}` },
    ],
    { maxTokens: 200, temperature: 0 },
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

  if (data.intent === "store_insight") {
    const topic =
      data.topic && (INSIGHT_TOPICS as readonly string[]).includes(data.topic)
        ? (data.topic as InsightTopic)
        : "overview";
    return { type: "store_insight", topic };
  }

  if (data.intent === "plan_trip") {
    return { type: "plan_trip" };
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

// FU-12：运营问数规则兜底——关键词命中即归 store_insight（topic 按最具体优先）。
// 注意：mood/scene 枚举词（如「治愈」）优先于 insight 关键词（「心情不好想看治愈的」是 recommend）；
// 借/还分支内嵌 insight 判定，避免「最近借阅怎么样」这类含「借」字的运营问数被误判 borrow_unresolved；
// 借分支内还内嵌 mood 判定（insight 之后、borrow_unresolved 之前），「想借个治愈的片子」回落 recommend。
const INSIGHT_KEYWORD_RULES: Array<{ topic: InsightTopic; pattern: RegExp }> = [
  { topic: "popular", pattern: /最火|热门|畅销/ },
  { topic: "inventory", pattern: /库存|缺货|断货|在库/ },
  { topic: "trend", pattern: /趋势|走势|最近借阅/ },
  { topic: "mood_scene", pattern: /心情|场景/ },
  { topic: "activity", pattern: /活跃|注册|用户数/ },
  { topic: "overview", pattern: /店况|运营|数据|看板|总览/ },
];

export function classifyStoreInsightByRules(message: string): InsightTopic | null {
  for (const rule of INSIGHT_KEYWORD_RULES) {
    if (rule.pattern.test(message)) {
      return rule.topic;
    }
  }
  return null;
}

// FU-13：旅行规划关键词——命中即 plan_trip。刻意不含「规划」单字（「规划一下库存」属运营语境，交由 LLM/insight 判定）。
// 影片名词在句时旅行词只是题材修饰（「有没有旅行为主题的片子」问的是片不是行程），规则不命中、交 LLM 判定
const TRAVEL_KEYWORD_RULES: Array<{ pattern: RegExp }> = [
  { pattern: /旅行|旅游|出游|行程|想去|去哪玩|周末去哪|去.*(玩|旅游)/ },
];

const MOVIE_NOUN_PATTERN = /片子|影片|电影|短片|纪录片|碟片|录像带/;

export function isPlanTripByRules(message: string): boolean {
  if (MOVIE_NOUN_PATTERN.test(message)) {
    return false;
  }
  return TRAVEL_KEYWORD_RULES.some((rule) => rule.pattern.test(message));
}

export async function classifyIntentByRules(message: string): Promise<ChatIntent> {
  if (message.includes("借")) {
    const titles = await movieService.listMoviesForTitleMatch();
    const haystack = message.toLowerCase();
    const matches = titles.filter((movie) => haystack.includes(movie.title.toLowerCase()));
    if (matches.length === 1) {
      return { type: "borrow", movieId: matches[0].id };
    }
    // 含「借」但无唯一片名：先试运营问数（如「最近借阅情况」「库存借出最多」），
    // 再试心情/场景（「想借个治愈的片子」要的是推荐，不是借某一部），最后才判 borrow_unresolved
    const insightTopic = classifyStoreInsightByRules(message);
    if (insightTopic) {
      return { type: "store_insight", topic: insightTopic };
    }
    const { moods, scenes } = parseMoodsAndScenes(message);
    if (moods.length > 0 || scenes.length > 0) {
      return { type: "recommend", moods, scenes };
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

  if (isPlanTripByRules(message)) {
    return { type: "plan_trip" };
  }

  const insightTopic = classifyStoreInsightByRules(message);
  if (insightTopic) {
    return { type: "store_insight", topic: insightTopic };
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

  // FU-12/13：运营问数与旅行规划关键词先于 LLM——模型对严格 JSON 输出不可靠，规则命中即返回保证确定性；
  // 其余意图（借/还/推荐/闲聊）仍 LLM 优先，规则仅作兜底。
  const ruleIntent = await classifyIntentByRules(input.message);
  if (ruleIntent.type === "store_insight" || ruleIntent.type === "plan_trip") {
    return ruleIntent;
  }

  const llm = await classifyIntentWithLlm(input.message, input.history);
  if (llm) {
    return llm;
  }

  return ruleIntent;
}

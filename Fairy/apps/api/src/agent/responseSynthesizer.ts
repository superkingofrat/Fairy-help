import type {
  BorrowSseEvent,
  Movie,
  Profile,
  RecommendationSseEvent,
  TextSseEvent,
} from "@fairy/shared";
import { sanitizeUserInput, tryChat } from "./llmClient";
import type { ToolObservation } from "./toolDispatcher";

export interface SynthesizedResponse {
  texts: TextSseEvent[];
  recommendation?: RecommendationSseEvent;
  borrow?: BorrowSseEvent;
}

export interface SynthesisContext {
  message: string;
  profile: Profile | null;
}

const REPLY_SYSTEM_PROMPT = `你是 Fairy，一家录像带门店的 AI 助理，语气温暖自然，用中文回复，一到两句。你只能使用【事实】中给出的信息；不得编造片名、库存数字或做出无法兑现的承诺；事实为空时自然回应，并引导用户说出心情、场景或想借的影片。`;

function movieLine(movie: Movie): string {
  return `《${movie.title}》`;
}

function profileLine(profile: Profile | null): string {
  if (!profile) {
    return "用户画像：（暂无）";
  }
  return `用户画像：名字 ${profile.name}；喜欢的类型 ${profile.likeGenres.join("、") || "暂无"}`;
}

function templateForNone(reason: "unmatched" | "borrow_unresolved" | "chitchat"): string {
  if (reason === "borrow_unresolved") {
    return "没能确定要借哪一部。可以说完整片名，或点推荐卡片上的借阅按钮。";
  }
  return "可以说一个心情或场景，比如「雨天」或「治愈」，也可以点卡片借阅。";
}

async function generateReply(
  context: SynthesisContext,
  facts: string
): Promise<string | null> {
  const message = sanitizeUserInput(context.message);
  const userContent = `用户说：「${message}」\n${profileLine(context.profile)}\n【事实】${facts}`;

  const result = await tryChat(
    "agent.reply",
    [
      { role: "system", content: REPLY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    { maxTokens: 300, temperature: 0.5 }
  );

  const text = result?.text.trim();
  return text ? text : null;
}

export async function synthesize(
  observation: ToolObservation,
  context: SynthesisContext
): Promise<SynthesizedResponse> {
  if (observation.kind === "none") {
    const template = templateForNone(observation.reason);
    const facts =
      observation.reason === "borrow_unresolved"
        ? "用户想借片，但未能确定是哪一部（没有唯一匹配的片名）。"
        : "没有工具调用结果：未能从消息中识别出借片或推荐意图（chitchat 视为正常闲聊）。";
    const text = (await generateReply(context, facts)) ?? template;
    return { texts: [{ content: text }] };
  }

  if (observation.kind === "recommend") {
    if (observation.movies.length === 0) {
      const template = "这会儿没有符合心情和场景、又有库存的片子。换个标签再试试？";
      const text = (await generateReply(context, "推荐结果为空：没有符合心情和场景、又有库存的影片。")) ?? template;
      return { texts: [{ content: text }] };
    }

    const names = observation.movies.map(movieLine).join("、");
    const template = `为你找到这些可借的片子：${names}。点卡片就能借阅。`;
    const facts = `推荐了以下有库存的影片：${observation.movies
      .map((movie) => `${movie.title}（类型：${movie.genres.join("、") || "未标注"}，可借 ${movie.stock}）`)
      .join("；")}。`;
    const text = (await generateReply(context, facts)) ?? template;
    return {
      texts: [{ content: text }],
      recommendation: { items: observation.movies },
    };
  }

  if (observation.success) {
    const template = "借阅成功，愿这段旅程治愈你。";
    const facts = `借阅成功，该片剩余可借库存 ${observation.remainingStock}。`;
    const text = (await generateReply(context, facts)) ?? template;
    return {
      texts: [{ content: text }],
      borrow: {
        success: true,
        remainingStock: observation.remainingStock,
        rentalId: observation.rentalId,
        code: observation.code,
      },
    };
  }

  const messages: Record<string, string> = {
    OUT_OF_STOCK: "该影片暂时缺货。",
    ALREADY_BORROWED: "你已经借过这部片子，还没还呢。",
    MOVIE_NOT_FOUND: "找不到这部影片。",
  };
  const template = messages[observation.code] ?? "借阅没有成功。";
  const text = (await generateReply(context, `借阅失败，原因代码 ${observation.code}。`)) ?? template;
  return {
    texts: [{ content: text }],
    borrow: {
      success: false,
      remainingStock: null,
      rentalId: null,
      code: observation.code,
    },
  };
}

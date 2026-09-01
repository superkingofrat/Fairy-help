import type {
  BorrowSseEvent,
  Movie,
  Profile,
  RecommendationSseEvent,
  ReturnSseEvent,
  TextSseEvent,
  StoreInsightsOverview,
  InsightTopic,
  TripSseEvent,
  TripResult,
  RouteLeg,
} from "@fairy/shared";
import { sanitizeUserInput, tryChat } from "./llmClient";
import type { ToolObservation } from "./toolDispatcher";

export interface SynthesizedResponse {
  texts: TextSseEvent[];
  recommendation?: RecommendationSseEvent;
  borrow?: BorrowSseEvent;
  return?: ReturnSseEvent;
  trip?: TripSseEvent;
}

export interface SynthesisContext {
  message: string;
  profile: Profile | null;
  activeRentals?: Array<{ movieTitle: string }>;
  history?: string;
}

const REPLY_SYSTEM_PROMPT = `你是 Fairy，绳匠的全能管家，平时打理一家录像带门店，语气温暖自然，用中文回复，一到两句。客户的需求（借还影片、推荐、店况问数、规划行程等）你都能接住：行程已经规划好就直接大方呈现，绝不说"这不是我的专长"，绝不转而推荐影片。你只能使用【事实】中给出的信息；不得编造片名、库存数字或做出无法兑现的承诺；事实为空时自然回应，并引导用户说出心情、场景或想借的影片。`;

function movieLine(movie: Movie): string {
  return `《${movie.title}》`;
}

function profileLine(profile: Profile | null): string {
  if (!profile) {
    return "用户画像：（暂无）";
  }
  return `用户画像：名字 ${profile.name}；喜欢的类型 ${profile.likeGenres.join("、") || "暂无"}`;
}

function templateForNone(
  reason: "unmatched" | "borrow_unresolved" | "return_unresolved" | "chitchat"
): string {
  if (reason === "borrow_unresolved") {
    return "没能确定要借哪一部。可以说完整片名，或点推荐卡片上的借阅按钮。";
  }
  return "可以说一个心情或场景，比如「雨天」或「治愈」，也可以点卡片借阅。";
}

// FU-12：运营问数——按 topic 从 overview 构造【事实】与兜底模板。
function buildInsightFacts(
  topic: InsightTopic,
  overview: StoreInsightsOverview
): { facts: string; template: string } {
  if (topic === "popular") {
    if (overview.popularMovies.length === 0) {
      return {
        facts: "热门影片：暂无借阅数据。",
        template: "目前还没有足够的借阅数据，暂时出不了热门榜单。",
      };
    }
    const top = overview.popularMovies[0];
    const lines = overview.popularMovies
      .map(
        (movie) =>
          `${movie.title}（借出 ${movie.borrowCount} 次${movie.inStock ? "，可借" : "，已借完"}）`
      )
      .join("、");
    return {
      facts: `热门影片 TOP：${lines}。`,
      template: `最近最火的是《${top.title}》，借出 ${top.borrowCount} 次，还有 ${overview.popularMovies.length} 部紧随其后。`,
    };
  }

  if (topic === "trend") {
    if (overview.trend.length === 0) {
      return {
        facts: "借阅趋势：暂无数据。",
        template: "还没有借阅记录，趋势暂时出不来。",
      };
    }
    const borrowTotal = overview.trend.reduce((sum, point) => sum + point.borrowCount, 0);
    const returnTotal = overview.trend.reduce((sum, point) => sum + point.returnCount, 0);
    const recent = overview.trend.slice(-3);
    const recentLine = recent
      .map((point) => `${point.date.slice(5)}：借 ${point.borrowCount} 还 ${point.returnCount}`)
      .join("，");
    return {
      facts: `近 ${overview.trend.length} 天借出合计 ${borrowTotal} 次、归还合计 ${returnTotal} 次；最近三天 ${recentLine}。`,
      template: `最近这些天共借出 ${borrowTotal} 次、归还 ${returnTotal} 次，最近三天（${recentLine}）。`,
    };
  }

  if (topic === "inventory") {
    const { activeRentals, borrowedRatio, lowStockMovies } = overview.inventory;
    const lowLine =
      lowStockMovies.length > 0
        ? lowStockMovies.map((movie) => `${movie.title}（剩 ${movie.stock}）`).join("、")
        : "无";
    return {
      facts: `库存状态：当前借出 ${activeRentals} 部，占比 ${Math.round(borrowedRatio * 100)}%；低库存影片：${lowLine}。`,
      template:
        lowStockMovies.length > 0
          ? `当前有 ${activeRentals} 部在外借，低库存的片子有：${lowLine}。`
          : `库存状态不错：当前 ${activeRentals} 部在外借，没有低库存影片。`,
    };
  }

  if (topic === "mood_scene") {
    const moodLine =
      overview.moods.length > 0
        ? overview.moods.map((item) => `${item.value} ${item.count}`).join("、")
        : "暂无";
    const sceneLine =
      overview.scenes.length > 0
        ? overview.scenes.map((item) => `${item.value} ${item.count}`).join("、")
        : "暂无";
    return {
      facts: `近 30 天借出心情分布 TOP：${moodLine}；场景分布 TOP：${sceneLine}。`,
      template: `近 30 天借得最多的是${overview.moods[0] ? `「${overview.moods[0].value}」类的片子` : ""}${
        overview.scenes[0] ? `，常配的场景是「${overview.scenes[0].value}」` : ""
      }。`,
    };
  }

  if (topic === "activity") {
    const { totalUsers, activeUsers7d, newUsers7d } = overview.activity;
    return {
      facts: `活跃概况：注册用户 ${totalUsers} 人，近 7 天活跃 ${activeUsers7d} 人、新注册 ${newUsers7d} 人。`,
      template: `现在共有 ${totalUsers} 位注册用户，近 7 天有 ${activeUsers7d} 位活跃、${newUsers7d} 位新加入。`,
    };
  }

  // overview（默认）：浓缩摘要
  const popularLine =
    overview.popularMovies.length > 0
      ? `最火的是《${overview.popularMovies[0].title}》（借出 ${overview.popularMovies[0].borrowCount} 次）`
      : "还没有借阅数据";
  const borrowTotal = overview.trend.reduce((sum, point) => sum + point.borrowCount, 0);
  const { activeRentals } = overview.inventory;
  const lowCount = overview.inventory.lowStockMovies.length;
  const moodTop = overview.moods[0]?.value ?? "—";
  const sceneTop = overview.scenes[0]?.value ?? "—";
  const { totalUsers, activeUsers7d, newUsers7d } = overview.activity;
  return {
    facts: `店况摘要：${popularLine}；近 14 天借出 ${borrowTotal} 次；当前 ${activeRentals} 部在外借（低库存 ${lowCount} 部）；近 30 天借出心情最多「${moodTop}」、场景最多「${sceneTop}」；注册用户 ${totalUsers} 人，近 7 天活跃 ${activeUsers7d} 人、新注册 ${newUsers7d} 人。`,
    template: `最近${popularLine}。近 14 天共借出 ${borrowTotal} 次，当前 ${activeRentals} 部在外借${
      lowCount > 0 ? `，有 ${lowCount} 部低库存` : ""
    }；注册用户 ${totalUsers} 人，近 7 天活跃 ${activeUsers7d} 人。`,
  };
}

// FU-13：旅行规划——从 TripResult 构造【事实】与兜底模板。
function buildTripFacts(trip: TripResult): { facts: string; template: string } {
  const dayCount = trip.itinerary.length;
  const poiLine = trip.itinerary
    .map((day) => `Day ${day.day} ${day.steps.map((step) => step.name).join("→")}`)
    .join("；");
  const validatedLine = trip.validated ? "" : "（POI 未经验证，仅供参考）";
  const routeLine = routeSummary(trip.route);
  return {
    facts: `行程规划成功：目的地 ${trip.destination}，${dayCount} 天。${poiLine}${validatedLine}${routeLine}`,
    template: `给你规划了「${trip.destination}」${dayCount} 天的行程：${poiLine}。${validatedLine}`,
  };
}

function routeSummary(route: RouteLeg[] | null): string {
  if (!route || route.length === 0) {
    return "";
  }
  const distanceKm = route.reduce(
    (sum, leg) => sum + (leg.distanceMeters ?? 0),
    0
  ) / 1000;
  const durationMinutes = route.reduce(
    (sum, leg) => sum + (leg.durationSeconds ?? 0),
    0
  ) / 60;
  return ` 全程约 ${distanceKm.toFixed(1)} 公里、车程约 ${Math.round(durationMinutes)} 分钟。`;
}

async function generateReply(
  context: SynthesisContext,
  facts: string
): Promise<string | null> {
  const message = sanitizeUserInput(context.message);
  const historyLine = context.history ? `对话历史：\n${context.history}\n` : "";
  const userContent = `${historyLine}用户说：「${message}」\n${profileLine(context.profile)}\n【事实】${facts}`;

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
  if (observation.kind === "insight") {
    if (observation.forbidden) {
      const template = "这个功能目前只对门店管理员开放哦。";
      const facts = "用户（非管理员）询问店内运营数据，已拒绝；不得透露任何数据。";
      const text = (await generateReply(context, facts)) ?? template;
      return { texts: [{ content: text }] };
    }
    if (!observation.success || !observation.overview) {
      const template = "店内数据这会儿拉取失败了，稍后再试试？";
      const text = (await generateReply(context, "店内运营数据聚合失败，无法提供数据。")) ?? template;
      return { texts: [{ content: text }] };
    }
    const { facts, template } = buildInsightFacts(observation.topic, observation.overview);
    const text = (await generateReply(context, facts)) ?? template;
    return { texts: [{ content: text }] };
  }

  if (observation.kind === "none") {
    if (observation.reason === "return_unresolved") {
      const rentals = context.activeRentals ?? [];
      const facts =
        rentals.length > 0
          ? `用户想归还影片但未能确定是哪一部。当前借阅中的影片：${rentals
              .map((rental) => rental.movieTitle)
              .join("、")}。`
          : "用户想归还影片但未能确定是哪一部。当前没有借阅中的影片。";
      const template =
        rentals.length > 0
          ? `你当前借阅中的影片：${rentals
              .map((rental) => `《${rental.movieTitle}》`)
              .join("、")}。可以说完整片名归还。`
          : "你目前没有借阅中的影片。";
      const text = (await generateReply(context, facts)) ?? template;
      return { texts: [{ content: text }] };
    }

    const template = templateForNone(observation.reason);
    const facts =
      observation.reason === "borrow_unresolved"
        ? "用户想借片，但未能确定是哪一部（没有唯一匹配的片名）。"
        : "没有工具调用结果：未能从消息中识别出借片或推荐意图（chitchat 视为正常闲聊）。";
    const text = (await generateReply(context, facts)) ?? template;
    return { texts: [{ content: text }] };
  }

  if (observation.kind === "trip") {
    // 非代理人（绳匠/其他用户）请求行程规划：仅影片服务，婉拒并引导推荐
    if (observation.code === "TRIP_FORBIDDEN") {
      const template =
        "行程规划可不是我的专长哦，不过如果你想找旅行或目的地相关的片子，我可以帮你推荐几部。";
      const facts =
        "用户（非代理人）请求规划行程，已婉拒：行程规划不在门店服务范围；应表示这不是专长，并引导推荐影片。";
      const text = (await generateReply(context, facts)) ?? template;
      return { texts: [{ content: text }] };
    }
    if (observation.unresolved) {
      const template = "想去哪儿玩呀？告诉我一个目的地（比如城市名），我来帮你规划。";
      const facts = "用户请求规划行程但未能确定目的地；应引导用户说出目的地。";
      const text = (await generateReply(context, facts)) ?? template;
      return { texts: [{ content: text }] };
    }
    if (!observation.success || !observation.trip) {
      const template = "行程规划这会儿出了点状况，稍后再试？";
      const facts = "行程规划失败（草稿生成或落库异常），无法提供行程。";
      const text = (await generateReply(context, facts)) ?? template;
      return { texts: [{ content: text }] };
    }
    const { facts, template } = buildTripFacts(observation.trip);
    const text = (await generateReply(context, facts)) ?? template;
    return { texts: [{ content: text }], trip: { trip: observation.trip } };
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

  if (observation.kind === "return") {
    if (observation.success) {
      const template = `已归还，该片剩余可借 ${observation.remainingStock}。`;
      const facts = `归还成功，该片剩余可借库存 ${observation.remainingStock}。`;
      const text = (await generateReply(context, facts)) ?? template;
      return {
        texts: [{ content: text }],
        return: {
          success: true,
          remainingStock: observation.remainingStock,
          rentalId: observation.rentalId,
          code: observation.code,
        },
      };
    }

    const messages: Record<string, string> = {
      RENTAL_NOT_FOUND: "你目前没有借这部片子。",
    };
    const template = messages[observation.code] ?? "归还没有成功。";
    const text = (await generateReply(context, `归还失败，原因代码 ${observation.code}。`)) ?? template;
    return {
      texts: [{ content: text }],
      return: {
        success: false,
        remainingStock: null,
        rentalId: null,
        code: observation.code,
      },
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

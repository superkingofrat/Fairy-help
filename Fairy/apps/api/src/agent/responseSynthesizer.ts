import type {
  BorrowSseEvent,
  MemoryRecord,
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
import { sanitizeUserInput, tryChat } from "./llmClient.js";
import { buildMemoryBlock, wrapUntrustedSpan } from "./contextBuilder.js";
import type { ToolObservation } from "./toolDispatcher.js";

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
  memories?: MemoryRecord[];
}

const REPLY_SYSTEM_PROMPT = `你是 Fairy，绳匠的全能管家，平时打理一家录像带门店，语气温暖自然，用中文回复，一到两句。客户的需求（借还影片、推荐、店况问数、规划行程等）你都能接住：行程已经规划好就直接大方呈现，绝不说"这不是我的专长"，绝不转而推荐影片。你只能使用【事实】中给出的信息；不得编造片名、库存数字或做出无法兑现的承诺；事实为空时自然回应，并引导用户说出心情、场景或想借的影片。若【事实】中给出了影片台词，可原样引用其中一部分，不得改写或编造台词。`;

function movieLine(movie: Movie): string {
  return `《${movie.title}》`;
}

// 台词注入上限：避免长推荐列表把 prompt 撑爆（需求待决问题 1 定稿）
const MAX_QUOTE_INJECTIONS = 3;

// 通用回复预算：对话式回复「一到两句」足够。默认供应商是 reasoning 模型，思考与正文
// 共用这一个 completion 预算，故不能贴着典型用量设（同 ARCHITECTURE §8 约定）。
const DEFAULT_REPLY_MAX_TOKENS = 300;
// 行程回复要概括「目的地+天数+体现偏好的安排+路线」，实测 137-274 token（2 天行程、
// 事实含 day.title 与 step.note，13 轮实调）；300 下曾有一轮顶格截断在半句，故单独放宽，
// 600 下 12 轮零截断。只放宽行程分支，不动其他分支的用量画像。
const TRIP_REPLY_MAX_TOKENS = 600;

function movieQuote(movie: Movie): string | null {
  const quote = movie.quote?.trim();
  return quote ? quote : null;
}

function profileLine(profile: Profile | null): string {
  if (!profile) {
    return "用户画像：（暂无）";
  }
  return `用户画像：名字 ${profile.name}；喜欢的类型 ${profile.likeGenres.join("、") || "暂无"}`;
}

function templateForNone(
  reason: "unmatched" | "borrow_unresolved" | "return_unresolved" | "chitchat",
): string {
  if (reason === "borrow_unresolved") {
    return "没能确定要借哪一部。可以说完整片名，或点推荐卡片上的借阅按钮。";
  }
  return "可以说一个心情或场景，比如「雨天」或「治愈」，也可以点卡片借阅。";
}

// FU-12：运营问数——按 topic 从 overview 构造【事实】与兜底模板。
function buildInsightFacts(
  topic: InsightTopic,
  overview: StoreInsightsOverview,
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
          `${movie.title}（借出 ${movie.borrowCount} 次${movie.inStock ? "，可借" : "，已借完"}）`,
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
// day.title 与 step.note 是画像偏好真正的落点（同行人偏好、行程质感都写在这里），
// 早先只拼 step.name，定制信息在进模型前就被丢掉，用户看到的就只剩一串通用地名。
function buildTripFacts(trip: TripResult): { facts: string; template: string } {
  const dayCount = trip.itinerary.length;
  const poiLine = trip.itinerary
    .map((day) => {
      const title = day.title ? `「${day.title}」` : "";
      const steps = day.steps
        .map((step) => (step.note ? `${step.name}（${step.note}）` : step.name))
        .join("→");
      return `Day ${day.day}${title} ${steps}`;
    })
    .join("；");
  const validatedLine = trip.validated ? "" : "（POI 未经验证，仅供参考）";
  const routeLine = routeSummary(trip.route);
  // FU-21：偏好依据。逐条带进【事实】，回复才能说「按什么偏好订的」而不是复读一句断言；
  // 带 day 与 step 名，依据才能落到具体安排上（否则又是一句无从核对的空话）。
  const basisLine = buildBasisLine(trip);
  const hasBasis = basisLine.length > 0;
  // 同行人归属：事实里点名该同行人，回复才能把「体现偏好的安排」归到具体的人（而不是模型从
  // 用户消息原文猜的名字）。软约束——REPLY_SYSTEM_PROMPT 要求一到两句，硬性归属会逼出机械
  // 重复；末句是 AGENTS §0 防幻觉落地：同行人的偏好来自其画像，不是他本轮说过的话。
  //
  // 「已体现在行程安排中」是有依据时才敢下的断言。FU-21 之前这句无条件输出：行程里一个依据
  // 都没有时，它仍会原样进【事实】，模型据此产出「节奏和时段都照着莱卡恩的偏好来安排的」，
  // 而那些安排全是普适旅游常识，与「洁癖/料理标准极高」零关系——幻觉由我们自己诱导。
  // 现在没有依据就只说明与谁同行，不断言已体现。
  const companionLine = trip.companion
    ? hasBasis
      ? `同行人：${trip.companion.name}。其偏好已体现在行程安排中（依据见「偏好依据」），回复可把具体安排归属于该同行人；不得编造其未表达过的偏好。`
      : `同行人：${trip.companion.name}。行程中暂无与该同行人偏好对应的具体安排，回复只可说明与谁同行，不得声称其偏好已体现在行程中。`
    : "";
  return {
    // 完整行程已由 trip SSE 事件在下方卡片逐条渲染，回复只负责概括并点出体现偏好的安排；
    // 不限制的话模型会逐条罗列，既冗长又把偏好淹没在地名里。
    facts: `行程规划成功：目的地 ${trip.destination}，${dayCount} 天。${poiLine}${validatedLine}${routeLine}完整行程已在下方行程卡片中逐条展示，回复只需概括目的地与天数、点出其中体现偏好的安排，不要逐条罗列全部步骤；不得编造行程中不存在的偏好。${companionLine}${basisLine}`,
    template: `给你规划了「${trip.destination}」${dayCount} 天的行程：${poiLine}。${validatedLine}${companionLine}${basisLine}`,
  };
}

// FU-21：把非空 preferenceBasis 逐条摊开。没有任何依据时返回空串——调用方据此关掉归属断言，
// 也让 facts/template 与没有该字段时逐字一致（不新增空壳行）。
function buildBasisLine(trip: TripResult): string {
  // 三元而非 filter：filter 不会把 step.preferenceBasis 收窄成 string，模板串里会留下
  // string | null（运行时虽被过滤掉，类型上却能把 null 拼进文案）
  const entries = trip.itinerary.flatMap((day) =>
    day.steps.flatMap((step) =>
      step.preferenceBasis ? [`Day ${day.day} ${step.name}：${step.preferenceBasis}`] : [],
    ),
  );
  return entries.length > 0 ? `偏好依据：${entries.join("；")}。` : "";
}

function routeSummary(route: RouteLeg[] | null): string {
  if (!route || route.length === 0) {
    return "";
  }
  const distanceKm = route.reduce((sum, leg) => sum + (leg.distanceMeters ?? 0), 0) / 1000;
  const durationMinutes = route.reduce((sum, leg) => sum + (leg.durationSeconds ?? 0), 0) / 60;
  return ` 全程约 ${distanceKm.toFixed(1)} 公里、车程约 ${Math.round(durationMinutes)} 分钟。`;
}

async function generateReply(
  context: SynthesisContext,
  facts: string,
  maxTokens: number = DEFAULT_REPLY_MAX_TOKENS,
  onDelta?: (delta: string) => void,
): Promise<string | null> {
  const message = sanitizeUserInput(context.message);
  // 三个不可信跨度（对话历史/当前消息/记忆）显式包裹，模型只把跨度内内容当数据；
  // 【事实】来自工具执行结果、是可信数据，永远放在跨度之外的末尾
  const historySpan = context.history ? wrapUntrustedSpan("对话历史", context.history) : "";
  const memorySpan =
    context.memories && context.memories.length > 0
      ? wrapUntrustedSpan("记忆", buildMemoryBlock(context.memories))
      : "";
  const userContent = [
    historySpan,
    wrapUntrustedSpan("用户消息", message),
    profileLine(context.profile),
    memorySpan,
    `【事实】${facts}`,
  ]
    .filter((part) => part.length > 0)
    .join("\n");

  const options = { maxTokens, temperature: 0.5 };
  const result = onDelta
    ? await tryChat(
        "agent.reply",
        [
          { role: "system", content: REPLY_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        options,
        onDelta,
      )
    : await tryChat(
        "agent.reply",
        [
          { role: "system", content: REPLY_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        options,
      );

  const text = result?.text.trim();
  return text ? text : null;
}

export async function synthesize(
  observation: ToolObservation,
  context: SynthesisContext,
  onDelta?: (delta: string) => void,
): Promise<SynthesizedResponse> {
  // 统一出口：带 onDelta 时走 provider.stream() 增量输出，否则保持一次性 chat()
  const reply = (facts: string, maxTokens?: number): Promise<string | null> =>
    onDelta
      ? generateReply(context, facts, maxTokens, onDelta)
      : generateReply(context, facts, maxTokens);

  if (observation.kind === "insight") {
    if (observation.forbidden) {
      const template = "这个功能目前只对门店管理员开放哦。";
      const facts = "用户（非管理员）询问店内运营数据，已拒绝；不得透露任何数据。";
      const text = (await reply(facts)) ?? template;
      return { texts: [{ content: text }] };
    }
    if (!observation.success || !observation.overview) {
      const template = "店内数据这会儿拉取失败了，稍后再试试？";
      const text = (await reply("店内运营数据聚合失败，无法提供数据。")) ?? template;
      return { texts: [{ content: text }] };
    }
    const { facts, template } = buildInsightFacts(observation.topic, observation.overview);
    const text = (await reply(facts)) ?? template;
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
      const text = (await reply(facts)) ?? template;
      return { texts: [{ content: text }] };
    }

    const template = templateForNone(observation.reason);
    const facts =
      observation.reason === "borrow_unresolved"
        ? "用户想借片，但未能确定是哪一部（没有唯一匹配的片名）。"
        : "没有工具调用结果：未能从消息中识别出借片或推荐意图（chitchat 视为正常闲聊）。";
    const text = (await reply(facts)) ?? template;
    return { texts: [{ content: text }] };
  }

  if (observation.kind === "trip") {
    // 非 agent/admin 角色请求行程规划：仅影片服务，婉拒并引导推荐
    if (observation.code === "TRIP_FORBIDDEN") {
      const template =
        "行程规划可不是我的专长哦，不过如果你想找旅行或目的地相关的片子，我可以帮你推荐几部。";
      const facts =
        "用户（非代理人）请求规划行程，已婉拒：行程规划不在门店服务范围；应表示这不是专长，并引导推荐影片。";
      const text = (await reply(facts)) ?? template;
      return { texts: [{ content: text }] };
    }
    if (observation.unresolved) {
      const template = "想去哪儿玩呀？告诉我一个目的地（比如城市名），我来帮你规划。";
      const facts = "用户请求规划行程但未能确定目的地；应引导用户说出目的地。";
      const text = (await reply(facts)) ?? template;
      return { texts: [{ content: text }] };
    }
    if (!observation.success || !observation.trip) {
      const template = "行程规划这会儿出了点状况，稍后再试？";
      const facts = "行程规划失败（草稿生成或落库异常），无法提供行程。";
      const text = (await reply(facts)) ?? template;
      return { texts: [{ content: text }] };
    }
    const { facts, template } = buildTripFacts(observation.trip);
    const text = (await reply(facts, TRIP_REPLY_MAX_TOKENS)) ?? template;
    return { texts: [{ content: text }], trip: { trip: observation.trip } };
  }

  if (observation.kind === "recommend") {
    if (observation.movies.length === 0) {
      const template = "这会儿没有符合心情和场景、又有库存的片子。换个标签再试试？";
      const text = (await reply("推荐结果为空：没有符合心情和场景、又有库存的影片。")) ?? template;
      return { texts: [{ content: text }] };
    }

    const names = observation.movies.map(movieLine).join("、");
    const quotable = observation.movies
      .map((movie) => ({ movie, quote: movieQuote(movie) }))
      .filter((entry): entry is { movie: Movie; quote: string } => entry.quote !== null)
      .slice(0, MAX_QUOTE_INJECTIONS);
    const template =
      quotable.length > 0
        ? `为你找到这些可借的片子：${names}。点卡片就能借阅。「${quotable[0].quote}」——《${quotable[0].movie.title}》`
        : `为你找到这些可借的片子：${names}。点卡片就能借阅。`;
    const facts = `推荐了以下有库存的影片：${observation.movies
      .map(
        (movie) =>
          `${movie.title}（类型：${movie.genres.join("、") || "未标注"}，可借 ${movie.stock}）`,
      )
      .join("；")}。${
      quotable.length > 0
        ? `台词原文：${quotable
            .map((entry) => `《${entry.movie.title}》台词：「${entry.quote}」`)
            .join("；")}。引用台词时请保持原文，可只引用其中一句，不得改写或编造。`
        : ""
    }`;
    const text = (await reply(facts)) ?? template;
    return {
      texts: [{ content: text }],
      recommendation: { items: observation.movies },
    };
  }

  if (observation.kind === "return") {
    if (observation.success) {
      const template = `已归还，该片剩余可借 ${observation.remainingStock}。`;
      const facts = `归还成功，该片剩余可借库存 ${observation.remainingStock}。`;
      const text = (await reply(facts)) ?? template;
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
    const text = (await reply(`归还失败，原因代码 ${observation.code}。`)) ?? template;
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
    const text = (await reply(facts)) ?? template;
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
  const text = (await reply(`借阅失败，原因代码 ${observation.code}。`)) ?? template;
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

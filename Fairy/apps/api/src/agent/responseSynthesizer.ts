import type { BorrowSseEvent, Movie, RecommendationSseEvent, TextSseEvent } from "@fairy/shared";
import type { ToolObservation } from "./toolDispatcher";

export interface SynthesizedResponse {
  texts: TextSseEvent[];
  recommendation?: RecommendationSseEvent;
  borrow?: BorrowSseEvent;
}

function movieLine(movie: Movie): string {
  return `《${movie.title}》`;
}

export function synthesize(observation: ToolObservation): SynthesizedResponse {
  if (observation.kind === "none") {
    if (observation.reason === "borrow_unresolved") {
      return {
        texts: [{ content: "没能确定要借哪一部。可以说完整片名，或点推荐卡片上的借阅按钮。" }],
      };
    }
    return {
      texts: [{ content: "可以说一个心情或场景，比如「雨天」或「治愈」，也可以点卡片借阅。" }],
    };
  }

  if (observation.kind === "recommend") {
    if (observation.movies.length === 0) {
      return {
        texts: [{ content: "这会儿没有符合心情和场景、又有库存的片子。换个标签再试试？" }],
      };
    }
    const names = observation.movies.map(movieLine).join("、");
    return {
      texts: [{ content: `为你找到这些可借的片子：${names}。点卡片就能借阅。` }],
      recommendation: { items: observation.movies },
    };
  }

  if (observation.success) {
    return {
      texts: [{ content: "借阅成功，愿这段旅程治愈你。" }],
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

  return {
    texts: [{ content: messages[observation.code] ?? "借阅没有成功。" }],
    borrow: {
      success: false,
      remainingStock: null,
      rentalId: null,
      code: observation.code,
    },
  };
}

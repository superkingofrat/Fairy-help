import type { Request, Response, NextFunction } from "express";
import type { Suggestion, SuggestionListQuery } from "@fairy/shared";
import * as suggestionService from "../services/suggestionService.js";

// 2026-09-23-proactive-ops-suggestions：运营建议 controller，保持薄——
// 所有判定（存在性、幂等、降级）都在 service 层，这里只做信封与状态码映射。

export async function listSuggestionsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = res.locals.validatedQuery as SuggestionListQuery;
    const { items, total } = await suggestionService.listSuggestions(query);
    const data = {
      items: items satisfies Suggestion[],
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 0,
      },
    };
    res.json({ code: "OK", data, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

export async function unreadCountHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const count = await suggestionService.getUnreadCount();
    res.json({ code: "OK", data: { count }, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

export async function markSuggestionReadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const suggestion = await suggestionService.markRead(req.params.id);
    if (!suggestion) {
      res.status(404).json({ code: "SUGGESTION_NOT_FOUND", data: null, msg: "建议不存在" });
      return;
    }
    res.json({ code: "OK", data: suggestion, msg: "已标记为已读" });
  } catch (error) {
    next(error);
  }
}

// 手动触发的当日日报：与调度器同一入口（当日幂等），已存在时返回既有产物。
export async function generateDailySuggestionHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const suggestion = await suggestionService.generateDailyReport();
    res.json({ code: "OK", data: suggestion, msg: "当日经营日报已就绪" });
  } catch (error) {
    next(error);
  }
}

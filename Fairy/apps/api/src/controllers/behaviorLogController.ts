import type { Request, Response, NextFunction } from "express";
import type { BehaviorLogQuery, BehaviorLogListItem } from "@fairy/shared";
import { userIdParamsSchema } from "@fairy/shared";
import * as behaviorLogService from "../services/behaviorLogService.js";

export async function listBehaviorLogsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = res.locals.validatedQuery as BehaviorLogQuery;

    if (query.userId) {
      const parsed = userIdParamsSchema.safeParse({ userId: query.userId });
      if (!parsed.success) {
        res.status(400).json({ code: "INVALID_USER_ID", data: null, msg: "用户 ID 无效" });
        return;
      }
    }

    const { items, total } = await behaviorLogService.listLogs(query);
    const data = {
      items: items satisfies BehaviorLogListItem[],
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

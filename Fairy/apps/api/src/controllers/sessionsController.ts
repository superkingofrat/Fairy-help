import type { Request, Response, NextFunction } from "express";
import { sessionIdParamSchema } from "@fairy/shared";
import * as sessionService from "../services/sessionService";

const ERROR_HTTP: Record<sessionService.SessionErrorCode, { status: number; msg: string }> = {
  SESSION_NOT_FOUND: { status: 404, msg: "会话不存在" },
  SESSION_FORBIDDEN: { status: 403, msg: "无权访问该会话" },
};

export async function createSessionHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = res.locals.userId as string;
    const data = await sessionService.createSession(userId);
    res.status(201).json({ code: "OK", data, msg: "会话已创建" });
  } catch (error) {
    next(error);
  }
}

export async function listSessionsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = res.locals.userId as string;
    const data = await sessionService.listSessions(userId);
    res.json({ code: "OK", data, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

export async function getSessionMessagesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = res.locals.userId as string;
    const param = sessionIdParamSchema.safeParse(req.params);
    if (!param.success) {
      res.status(400).json({ code: "VALIDATION_ERROR", data: null, msg: "会话 ID 无效" });
      return;
    }

    const result = await sessionService.getSessionMessages(userId, param.data.id);
    if (!result.ok) {
      const error = ERROR_HTTP[result.code];
      res.status(error.status).json({ code: result.code, data: null, msg: error.msg });
      return;
    }

    res.json({ code: "OK", data: result.messages, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

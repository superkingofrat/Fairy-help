import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/authService";

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await authService.authenticate(req.body.email, req.body.password);
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", data: null, msg: "邮箱或密码不正确" });
      return;
    }

    const token = authService.signToken(user);
    res.json({ code: "OK", data: { token, user }, msg: "登录成功" });
  } catch (error) {
    next(error);
  }
}

export async function meHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = res.locals.userId as string;
    const user = await authService.getUserById(userId);
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", data: null, msg: "会话已失效" });
      return;
    }

    res.json({ code: "OK", data: user, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

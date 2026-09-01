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

    const refreshToken = await authService.issueRefreshToken(user.id);
    const token = authService.signToken(user);
    res.json({ code: "OK", data: { token, refreshToken, user }, msg: "登录成功" });
  } catch (error) {
    next(error);
  }
}

export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await authService.registerUser(req.body.email, req.body.password);
    if (!result.ok) {
      res.status(409).json({ code: "EMAIL_ALREADY_EXISTS", data: null, msg: "该邮箱已注册" });
      return;
    }

    const refreshToken = await authService.issueRefreshToken(result.user.id);
    const token = authService.signToken(result.user);
    res.status(201).json({
      code: "OK",
      data: { token, refreshToken, user: result.user },
      msg: "注册成功",
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await authService.rotateRefreshToken(req.body.refreshToken);
    if (!result.ok) {
      res.status(401).json({ code: "INVALID_REFRESH_TOKEN", data: null, msg: "登录状态已过期，请重新登录" });
      return;
    }

    res.json({ code: "OK", data: result, msg: "刷新成功" });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await authService.revokeRefreshToken(req.body.refreshToken);
    res.json({ code: "OK", data: null, msg: "已退出登录" });
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

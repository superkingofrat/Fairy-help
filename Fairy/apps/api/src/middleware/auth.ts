import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export type Role = "admin" | "user";

interface TokenPayload {
  userId?: string;
  role?: string;
}

const UNAUTHORIZED_BODY = {
  code: "UNAUTHORIZED",
  data: null,
  msg: "未登录或凭证无效",
} as const;

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json(UNAUTHORIZED_BODY);
    return;
  }

  const token = authorization.slice("Bearer ".length);
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
  } catch {
    res.status(401).json(UNAUTHORIZED_BODY);
    return;
  }

  const { userId, role } = payload;
  if (!userId || (role !== "admin" && role !== "user")) {
    res.status(401).json(UNAUTHORIZED_BODY);
    return;
  }

  res.locals.userId = userId;
  res.locals.role = role;
  next();
}

export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const role = res.locals.role as Role | undefined;

    if (!role || !roles.includes(role)) {
      res.status(403).json({
        code: "FORBIDDEN",
        data: null,
        msg: "Insufficient permissions",
      });
      return;
    }

    next();
  };
}

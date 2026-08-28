import { DEV_ADMIN_ID, DEV_USER_ID } from "@fairy/shared";
import type { Request, Response, NextFunction } from "express";

export type DevRole = "admin" | "user";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let role: DevRole = "user";

  const headerRole = req.headers["x-dev-role"];
  if (headerRole === "admin" || headerRole === "user") {
    role = headerRole;
  } else {
    const authorization = req.headers.authorization;
    if (authorization?.startsWith("Bearer dev-")) {
      const tokenRole = authorization.slice("Bearer dev-".length);
      if (tokenRole === "admin" || tokenRole === "user") {
        role = tokenRole;
      }
    }
  }

  res.locals.userId = role === "admin" ? DEV_ADMIN_ID : DEV_USER_ID;
  res.locals.role = role;
  next();
}

export function requireRole(...roles: DevRole[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const role = res.locals.role as DevRole | undefined;

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

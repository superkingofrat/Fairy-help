import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { rentalsQuerySchema } from "@fairy/shared";
import type { Role } from "../middleware/auth.js";
import * as authService from "../services/authService.js";
import * as rentalService from "../services/rentalService.js";

const uuidSchema = z.string().uuid();

export async function listRentalsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = res.locals.role as Role;
    const callerId = res.locals.userId as string;

    const query = rentalsQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ code: "VALIDATION_ERROR", data: null, msg: "查询参数无效" });
      return;
    }
    const { status } = query.data;

    let userId = callerId;
    if (req.query.userId !== undefined) {
      if (role !== "admin") {
        res.status(403).json({ code: "FORBIDDEN", data: null, msg: "权限不足" });
        return;
      }
      const uuid = uuidSchema.safeParse(req.query.userId);
      if (!uuid.success) {
        res.status(400).json({ code: "INVALID_USER_ID", data: null, msg: "用户 ID 无效" });
        return;
      }
      const target = await authService.getUserById(uuid.data);
      if (!target) {
        res.status(404).json({ code: "USER_NOT_FOUND", data: null, msg: "用户不存在" });
        return;
      }
      userId = uuid.data;
    }

    const data = await rentalService.listRentals(userId, { status });
    res.json({ code: "OK", data, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

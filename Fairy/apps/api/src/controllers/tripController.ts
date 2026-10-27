import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { TripCreateRequest, TripListQuery } from "@fairy/shared";
import * as tripService from "../services/tripService.js";
import * as authService from "../services/authService.js";
import type { Role } from "../middleware/auth.js";

// FU-19（旅行规划二期）：行程 REST controller。角色门禁（admin/agent）与 chat dispatch
// trip 分支一致；越权读取统一 404 TRIP_NOT_FOUND，不泄漏行程存在性。
const uuidSchema = z.string().uuid();

export async function createTripHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = res.locals.role as Role;
    const userId = res.locals.userId as string;

    if (role !== "admin" && role !== "agent") {
      // 门禁先于任何 LLM 调用：不生成、不落库、不写行为日志。
      res.status(403).json({ code: "TRIP_FORBIDDEN", data: null, msg: "无权创建行程" });
      return;
    }

    const body = req.body as TripCreateRequest;
    const outcome = await tripService.createTrip(userId, body);

    if (!outcome.ok) {
      if (outcome.code === "TRIP_DRAFT_FAILED") {
        res
          .status(502)
          .json({ code: "TRIP_DRAFT_FAILED", data: null, msg: "行程生成失败，请稍后再试" });
        return;
      }
      res.status(400).json({ code: "TRIP_UNRESOLVED", data: null, msg: "无法确定目的地" });
      return;
    }

    res.status(201).json({ code: "OK", data: outcome.trip, msg: "行程已创建" });
  } catch (error) {
    next(error);
  }
}

export async function listTripsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = res.locals.role as Role;
    const callerId = res.locals.userId as string;
    const query = res.locals.validatedQuery as TripListQuery;

    let userId = callerId;
    if (_req.query.userId !== undefined) {
      if (role !== "admin") {
        res.status(403).json({ code: "FORBIDDEN", data: null, msg: "权限不足" });
        return;
      }
      const uuid = uuidSchema.safeParse(_req.query.userId);
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

    const { items, total } = await tripService.listTrips(userId, query);
    const data = {
      items,
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

export async function getTripHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = res.locals.role as Role;
    const callerId = res.locals.userId as string;
    const tripId = req.params.id as string;

    const found = await tripService.getTripDetail(tripId);
    // 不存在与他人所有同返 404，避免枚举泄漏存在性。
    if (!found || (found.ownerId !== callerId && role !== "admin")) {
      res.status(404).json({ code: "TRIP_NOT_FOUND", data: null, msg: "行程不存在" });
      return;
    }

    res.json({ code: "OK", data: found.trip, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

import type { Request, Response, NextFunction } from "express";
import type { CreateProfileInput, UpdateProfileInput } from "@fairy/shared";
import { userIdParamsSchema } from "@fairy/shared";
import type { Role } from "../middleware/auth";
import * as profileService from "../services/profileService";

export async function listProfilesHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await profileService.listUsersWithProfiles();
    res.json({ code: "OK", data, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

export async function getProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params = userIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ code: "INVALID_USER_ID", data: null, msg: "用户 ID 无效" });
      return;
    }

    const { userId } = params.data;
    const role = res.locals.role as Role | undefined;
    const callerId = res.locals.userId as string | undefined;

    if (role !== "admin" && callerId !== userId) {
      res.status(403).json({ code: "FORBIDDEN", data: null, msg: "权限不足" });
      return;
    }

    const profile = await profileService.getByUserId(userId);
    if (!profile) {
      res.status(404).json({ code: "PROFILE_NOT_FOUND", data: null, msg: "画像不存在" });
      return;
    }

    res.json({ code: "OK", data: profile, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

export async function createProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = req.body as CreateProfileInput;
    const result = await profileService.createForExistingUser(input);

    if (!result.ok) {
      const status = result.code === "USER_NOT_FOUND" ? 404 : 409;
      const msg = result.code === "USER_NOT_FOUND" ? "用户不存在" : "该用户已有画像";
      res.status(status).json({ code: result.code, data: null, msg });
      return;
    }

    res.status(201).json({ code: "OK", data: result.profile, msg: "创建成功" });
  } catch (error) {
    next(error);
  }
}

export async function updateProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params = userIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ code: "INVALID_USER_ID", data: null, msg: "用户 ID 无效" });
      return;
    }

    const input = req.body as UpdateProfileInput;
    const profile = await profileService.updateByUserId(params.data.userId, input);

    if (!profile) {
      res.status(404).json({ code: "PROFILE_NOT_FOUND", data: null, msg: "画像不存在" });
      return;
    }

    res.json({ code: "OK", data: profile, msg: "更新成功" });
  } catch (error) {
    next(error);
  }
}

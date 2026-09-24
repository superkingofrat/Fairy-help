import type { Request, Response, NextFunction } from "express";
import type {
  MemoryCreateInput,
  MemoryListItem,
  MemoryQuery,
  MemorySelfListItem,
  MemorySelfQuery,
  MemoryUpdateInput,
} from "@fairy/shared";
import * as memoryService from "../memory/memoryService";

export async function listMemoriesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = res.locals.validatedQuery as MemoryQuery;
    const { items, total } = await memoryService.listMemories(query);
    const data = {
      items: items satisfies MemoryListItem[],
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

// FU-17：自查面——GET /api/memories/me。本人由鉴权中间件写入的 res.locals.userId 决定，
// 客户端传的 userId/email 已被 memorySelfQuerySchema 剥除（校验层忽略）。
export async function listMyMemoriesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const profileId = res.locals.userId as string;
    const query = res.locals.validatedQuery as MemorySelfQuery;
    const { items, total } = await memoryService.listOwnMemories(profileId, query);
    const data = {
      items: items satisfies MemorySelfListItem[],
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

export async function createMemoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as MemoryCreateInput;
    const result = await memoryService.createMemory(body);

    if (!result.ok) {
      res.status(404).json({
        code: "PROFILE_NOT_FOUND",
        data: null,
        msg: "用户画像不存在",
      });
      return;
    }

    res.status(201).json({ code: "OK", data: result.record, msg: "创建成功" });
  } catch (error) {
    next(error);
  }
}

export async function updateMemoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as MemoryUpdateInput;
    const record = await memoryService.updateMemory(req.params.id, body);

    if (!record) {
      res.status(404).json({
        code: "MEMORY_NOT_FOUND",
        data: null,
        msg: "记忆不存在",
      });
      return;
    }

    res.json({ code: "OK", data: record, msg: "更新成功" });
  } catch (error) {
    next(error);
  }
}

export async function deleteMemoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deleted = await memoryService.deleteMemory(req.params.id);

    if (!deleted) {
      res.status(404).json({
        code: "MEMORY_NOT_FOUND",
        data: null,
        msg: "记忆不存在",
      });
      return;
    }

    res.json({ code: "OK", data: { id: req.params.id }, msg: "删除成功" });
  } catch (error) {
    next(error);
  }
}

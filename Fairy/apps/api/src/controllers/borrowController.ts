import type { Request, Response, NextFunction } from "express";
import { borrowMovieTool } from "../tools/borrowMovieTool";

const HTTP_STATUS_BY_CODE: Record<string, number> = {
  MOVIE_NOT_FOUND: 404,
  ALREADY_BORROWED: 409,
  OUT_OF_STOCK: 409,
};

const MSG_BY_CODE: Record<string, string> = {
  MOVIE_NOT_FOUND: "影片不存在",
  ALREADY_BORROWED: "你已经借过这部片子，还没还呢。",
  OUT_OF_STOCK: "该影片暂时缺货。",
};

export async function borrowHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = res.locals.userId as string;
    const { movieId } = req.body as { movieId: string };

    const result = await borrowMovieTool({ userId, movieId });

    if (result.success && result.data) {
      res.status(201).json({
        code: "OK",
        data: { rentalId: result.data.rentalId, remainingStock: result.data.remainingStock },
        msg: "借阅成功",
      });
      return;
    }

    const code = result.error ?? "INTERNAL_ERROR";
    res.status(HTTP_STATUS_BY_CODE[code] ?? 500).json({
      code,
      data: null,
      msg: MSG_BY_CODE[code] ?? "借阅没有成功。",
    });
  } catch (error) {
    next(error);
  }
}

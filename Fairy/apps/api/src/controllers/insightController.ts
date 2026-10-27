import type { Request, Response, NextFunction } from "express";
import { getStoreInsightsOverview } from "../services/insightService.js";

export async function getInsightsOverviewHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getStoreInsightsOverview();
    res.json({ code: "OK", data, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

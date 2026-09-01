import { Router, type IRouter } from "express";
import { getInsightsOverviewHandler } from "../controllers/insightController";
import { requireRole } from "../middleware/auth";

const router: IRouter = Router();

router.get("/overview", requireRole("admin"), getInsightsOverviewHandler);

export { router as insightsRouter };

import { Router, type IRouter } from "express";
import { getInsightsOverviewHandler } from "../controllers/insightController.js";
import { requireRole } from "../middleware/auth.js";

const router: IRouter = Router();

router.get("/overview", requireRole("admin"), getInsightsOverviewHandler);

export { router as insightsRouter };

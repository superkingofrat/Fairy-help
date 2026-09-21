import { Router, type IRouter } from "express";
import { behaviorLogQuerySchema } from "@fairy/shared";
import { listBehaviorLogsHandler } from "../controllers/behaviorLogController";
import { requireRole } from "../middleware/auth";
import { validateQuery } from "../middleware/validateBody";

const router: IRouter = Router();

router.get(
  "/",
  requireRole("admin"),
  validateQuery(behaviorLogQuerySchema),
  listBehaviorLogsHandler,
);

export { router as behaviorLogsRouter };

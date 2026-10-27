import { Router, type IRouter } from "express";
import { behaviorLogQuerySchema } from "@fairy/shared";
import { listBehaviorLogsHandler } from "../controllers/behaviorLogController.js";
import { requireRole } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validateBody.js";

const router: IRouter = Router();

router.get(
  "/",
  requireRole("admin"),
  validateQuery(behaviorLogQuerySchema),
  listBehaviorLogsHandler,
);

export { router as behaviorLogsRouter };

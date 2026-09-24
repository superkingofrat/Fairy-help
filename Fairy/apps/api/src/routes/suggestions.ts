import { Router, type IRouter } from "express";
import { suggestionListQuerySchema } from "@fairy/shared";
import {
  generateDailySuggestionHandler,
  listSuggestionsHandler,
  markSuggestionReadHandler,
  unreadCountHandler,
} from "../controllers/suggestionController";
import { validateQuery } from "../middleware/validateBody";
import { requireRole } from "../middleware/auth";

// 2026-09-23-proactive-ops-suggestions：运营建议 REST 端点（admin-only）。
// 生成由服务层调度器负责；本文件只暴露读取面与手动触发入口。
const router: IRouter = Router();

router.get(
  "/",
  requireRole("admin"),
  validateQuery(suggestionListQuerySchema),
  listSuggestionsHandler,
);
router.get("/unread-count", requireRole("admin"), unreadCountHandler);
router.patch("/:id/read", requireRole("admin"), markSuggestionReadHandler);
router.post("/generate-daily", requireRole("admin"), generateDailySuggestionHandler);

export { router as suggestionsRouter };

import { Router, type IRouter } from "express";
import {
  memoryCreateSchema,
  memoryQuerySchema,
  memoryUpdateSchema,
} from "@fairy/shared";
import {
  createMemoryHandler,
  deleteMemoryHandler,
  listMemoriesHandler,
  updateMemoryHandler,
} from "../controllers/memoryController";
import { requireRole } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validateBody";

// FU-15：记忆管理面 REST 端点——全部 admin-only（403 FORBIDDEN，与 behavior-logs/insights 一致）。
const router: IRouter = Router();

router.get("/", requireRole("admin"), validateQuery(memoryQuerySchema), listMemoriesHandler);
router.post("/", requireRole("admin"), validateBody(memoryCreateSchema), createMemoryHandler);
router.patch("/:id", requireRole("admin"), validateBody(memoryUpdateSchema), updateMemoryHandler);
router.delete("/:id", requireRole("admin"), deleteMemoryHandler);

export { router as memoriesRouter };

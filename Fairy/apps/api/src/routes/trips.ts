import { Router, type IRouter } from "express";
import { tripCreateRequestSchema, tripListQuerySchema } from "@fairy/shared";
import { createTripHandler, getTripHandler, listTripsHandler } from "../controllers/tripController.js";
import { validateBody, validateQuery } from "../middleware/validateBody.js";

// FU-19（旅行规划二期）：行程 REST 端点。鉴权中间件由 app.ts 在挂载点统一施加；
// POST 的 admin/agent 门禁在 controller（错误码 TRIP_FORBIDDEN，与 chat dispatch 语义一致）。
const router: IRouter = Router();

router.post("/", validateBody(tripCreateRequestSchema), createTripHandler);
router.get("/", validateQuery(tripListQuerySchema), listTripsHandler);
router.get("/:id", getTripHandler);

export { router as tripsRouter };

import { Router, type IRouter } from "express";
import {
  createSessionHandler,
  getSessionMessagesHandler,
  listSessionsHandler,
} from "../controllers/sessionsController";

const router: IRouter = Router();

router.post("/", createSessionHandler);
router.get("/", listSessionsHandler);
router.get("/:id", getSessionMessagesHandler);

export { router as sessionsRouter };

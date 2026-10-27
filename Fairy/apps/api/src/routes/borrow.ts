import { Router, type IRouter } from "express";
import { borrowRequestSchema } from "@fairy/shared";
import { borrowHandler } from "../controllers/borrowController.js";
import { validateBody } from "../middleware/validateBody.js";

const router: IRouter = Router();

router.post("/", validateBody(borrowRequestSchema), borrowHandler);

export { router as borrowRouter };

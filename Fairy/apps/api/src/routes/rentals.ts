import { Router, type IRouter } from "express";
import { listRentalsHandler } from "../controllers/rentalsController.js";

const router: IRouter = Router();

router.get("/", listRentalsHandler);

export { router as rentalsRouter };

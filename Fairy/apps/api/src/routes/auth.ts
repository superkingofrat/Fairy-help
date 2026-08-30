import { Router, type IRouter } from "express";
import { loginSchema } from "@fairy/shared";
import { loginHandler, meHandler } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";
import { validateBody } from "../middleware/validateBody";

const router: IRouter = Router();

// 公共端点（免认证）：登录
router.post("/login", validateBody(loginSchema), loginHandler);
router.get("/me", authMiddleware, meHandler);

export { router as authRouter };

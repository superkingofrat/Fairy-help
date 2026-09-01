import { Router, type IRouter } from "express";
import { loginSchema, registerSchema, refreshTokenSchema } from "@fairy/shared";
import { loginHandler, meHandler, registerHandler, refreshHandler, logoutHandler } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";
import { validateBody } from "../middleware/validateBody";

const router: IRouter = Router();

// 公共端点（免认证）：登录、注册、刷新、登出
router.post("/login", validateBody(loginSchema), loginHandler);
router.post("/register", validateBody(registerSchema), registerHandler);
router.post("/refresh", validateBody(refreshTokenSchema), refreshHandler);
router.post("/logout", validateBody(refreshTokenSchema), logoutHandler);
router.get("/me", authMiddleware, meHandler);

export { router as authRouter };

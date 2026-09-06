import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { authMiddleware } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { borrowRouter } from "./routes/borrow";
import { rentalsRouter } from "./routes/rentals";
import { moviesRouter } from "./routes/movies";
import { profilesRouter } from "./routes/profiles";
import { behaviorLogsRouter } from "./routes/behaviorLogs";
import { chatRouter } from "./routes/chat";
import { sessionsRouter } from "./routes/sessions";
import { insightsRouter } from "./routes/insights";
import { memoriesRouter } from "./routes/memories";

function tooManyRequests(_req: express.Request, res: express.Response): void {
  res.status(429).json({ code: "TOO_MANY_REQUESTS", data: null, msg: "尝试过于频繁，请稍后再试" });
}

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ code: "OK", data: { status: "healthy" }, msg: "ok" });
  });

  // 限流器在 createApp() 内创建，保证测试隔离；生产部署在反向代理后须设置 trust proxy
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooManyRequests,
  });
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooManyRequests,
  });

  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth/register", registerLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/movies", authMiddleware, moviesRouter);
  app.use("/api/borrow", authMiddleware, borrowRouter);
  app.use("/api/rentals", authMiddleware, rentalsRouter);
  app.use("/api/profiles", authMiddleware, profilesRouter);
  app.use("/api/behavior-logs", authMiddleware, behaviorLogsRouter);
  app.use("/api/chat", authMiddleware, chatRouter);
  app.use("/api/sessions", authMiddleware, sessionsRouter);
  app.use("/api/insights", authMiddleware, insightsRouter);
  app.use("/api/memories", authMiddleware, memoriesRouter);

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({
        code: "INTERNAL_ERROR",
        data: null,
        msg: "Unexpected server error",
      });
    }
  );

  return app;
}

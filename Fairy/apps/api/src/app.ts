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

function resolveTrustProxyHops(): number {
  const raw = process.env.TRUST_PROXY_HOPS?.trim();
  if (!raw) {
    return 1;
  }
  const hops = Number.parseInt(raw, 10);
  if (!Number.isInteger(hops) || hops < 0) {
    console.warn(`[app] invalid TRUST_PROXY_HOPS "${raw}", falling back to 1`);
    return 1;
  }
  return hops;
}

export function createApp(): express.Application {
  const app = express();

  // 反代后的客户端 IP 还原：express-rate-limit 按 req.ip 分桶，
  // 不信任代理时所有请求共享代理 IP，三个限流器会退化成全站单桶
  app.set("trust proxy", resolveTrustProxyHops());

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ code: "OK", data: { status: "healthy" }, msg: "ok" });
  });

  // 限流器在 createApp() 内创建，保证测试隔离
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

  // chat 限流：1 分钟 30 次，防刷 LLM 账单；限流器在 createApp() 内创建保证测试隔离
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooManyRequests,
  });
  app.use("/api/auth", authRouter);
  app.use("/api/movies", authMiddleware, moviesRouter);
  app.use("/api/borrow", authMiddleware, borrowRouter);
  app.use("/api/rentals", authMiddleware, rentalsRouter);
  app.use("/api/profiles", authMiddleware, profilesRouter);
  app.use("/api/behavior-logs", authMiddleware, behaviorLogsRouter);
  app.use("/api/chat", chatLimiter, authMiddleware, chatRouter);
  app.use("/api/sessions", authMiddleware, sessionsRouter);
  app.use("/api/insights", authMiddleware, insightsRouter);
  app.use("/api/memories", authMiddleware, memoriesRouter);

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
      res.status(500).json({
        code: "INTERNAL_ERROR",
        data: null,
        msg: "Unexpected server error",
      });
    },
  );

  return app;
}

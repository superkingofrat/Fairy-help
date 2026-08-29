import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authMiddleware } from "./middleware/auth";
import { moviesRouter } from "./routes/movies";
import { profilesRouter } from "./routes/profiles";
import { behaviorLogsRouter } from "./routes/behaviorLogs";
import { chatRouter } from "./routes/chat";

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ code: "OK", data: { status: "healthy" }, msg: "ok" });
  });

  app.use("/api/movies", authMiddleware, moviesRouter);
  app.use("/api/profiles", authMiddleware, profilesRouter);
  app.use("/api/behavior-logs", authMiddleware, behaviorLogsRouter);
  app.use("/api/chat", authMiddleware, chatRouter);

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

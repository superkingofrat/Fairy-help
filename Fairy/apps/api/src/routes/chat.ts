import { Router, type IRouter, type Response } from "express";
import { chatRequestSchema, type ChatRequestInput } from "@fairy/shared";
import { validateBody } from "../middleware/validateBody";
import { runChatTurn } from "../agent/stateLoop";

const router: IRouter = Router();

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post("/", validateBody(chatRequestSchema), async (req, res, next) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const body = req.body as ChatRequestInput;
    const userId = res.locals.userId as string;

    const result = await runChatTurn({
      userId,
      message: body.message,
      movieId: body.movieId,
    });

    for (const text of result.texts) {
      writeSse(res, "text", text);
    }
    if (result.recommendation) {
      writeSse(res, "recommendation", result.recommendation);
    }
    if (result.borrow) {
      writeSse(res, "borrow", result.borrow);
    }
    if (result.return) {
      writeSse(res, "return", result.return);
    }
    writeSse(res, "done", {});
    res.end();
  } catch (error) {
    if (res.headersSent) {
      // 流已开始：任何异常都不能悬挂客户端，也不能把堆栈写给用户。
      console.error("[chat] in-stream error:", error);
      writeSse(res, "text", { content: "Fairy 这边出了点小状况，请稍后再试。" });
      writeSse(res, "done", {});
      res.end();
      return;
    }
    next(error);
  }
});

export { router as chatRouter };

import { Router, type IRouter, type Response } from "express";
import { chatRequestSchema, type ChatEvent, type ChatRequestInput } from "@fairy/shared";
import { validateBody } from "../middleware/validateBody";
import { runChatTurn } from "../agent/stateLoop";
import type { SynthesizedResponse } from "../agent/responseSynthesizer";
import { buildConversationHistory } from "../agent/contextBuilder";
import { extractAndStoreMemories } from "../memory/memoryExtractor";
import * as sessionService from "../services/sessionService";
import type { Role } from "../middleware/auth";

const router: IRouter = Router();

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildEvents(result: SynthesizedResponse): ChatEvent[] {
  const events: ChatEvent[] = [];
  if (result.recommendation) {
    events.push({ type: "recommendation", items: result.recommendation.items });
  }
  if (result.borrow) {
    events.push({ type: "borrow", ...result.borrow });
  }
  if (result.return) {
    events.push({ type: "return", ...result.return });
  }
  if (result.trip) {
    events.push({ type: "trip", trip: result.trip.trip });
  }
  return events;
}

router.post("/", validateBody(chatRequestSchema), async (req, res, next) => {
  try {
    const body = req.body as ChatRequestInput;
    const userId = res.locals.userId as string;
    const role = (res.locals.role as Role | undefined) ?? "user";

    // 会话解析放在 SSE 头之前，保证 404/403 能以 JSON 返回
    let sessionId: string | undefined;
    if (body.sessionId) {
      const owned = await sessionService.getOwnedSession(userId, body.sessionId);
      if (!owned.ok) {
        const status = owned.code === "SESSION_NOT_FOUND" ? 404 : 403;
        const msg = owned.code === "SESSION_NOT_FOUND" ? "会话不存在" : "无权访问该会话";
        res.status(status).json({ code: owned.code, data: null, msg });
        return;
      }
      sessionId = body.sessionId;
    } else if (body.action !== "return") {
      // 普通消息缺 sessionId：自动建会话（标题由首条消息落库时生成）
      const created = await sessionService.createSession(userId);
      sessionId = created.id;
    }

    const history = sessionId ? await sessionService.getRecentMessages(userId, sessionId, 10) : [];
    const historyText = buildConversationHistory(history);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    try {
      // 真流式：合成的增量文本边生成边写出（onDelta），降级模板路径仍由下方统一补写
      let streamed = false;
      const result = await runChatTurn(
        {
          userId,
          message: body.message,
          movieId: body.movieId,
          action: body.action,
          history: historyText,
          role,
        },
        (delta) => {
          streamed = true;
          writeSse(res, "text", { content: delta });
        },
      );

      // 落库是旁路：失败不中断 SSE（可观测性损失，非功能损失）
      if (sessionId) {
        try {
          await sessionService.appendTurn(userId, sessionId, {
            userContent: body.message,
            assistantContent: result.texts.map((text) => text.content).join("\n"),
            events: buildEvents(result),
          });
        } catch (error) {
          console.error("[chat] persist session turn:", error);
        }
      }

      if (!streamed) {
        for (const text of result.texts) {
          writeSse(res, "text", text);
        }
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
      if (result.trip) {
        writeSse(res, "trip", result.trip);
      }
      writeSse(res, "done", { sessionId: sessionId ?? null });
      res.end();

      // FU-14：记忆抽取是旁路——SSE 完成后后台执行，失败静默（不中断、不悬挂响应）
      const replyText = result.texts.map((text) => text.content).join("\n");
      void extractAndStoreMemories({
        profileId: userId,
        sessionId,
        userMessage: body.message,
        replyText,
      }).catch((error) => {
        console.error("[chat] memory extraction:", error);
      });
    } catch (error) {
      // 流已开始：任何异常都不能悬挂客户端，也不能把堆栈写给用户。
      console.error("[chat] in-stream error:", error);
      writeSse(res, "text", { content: "Fairy 这边出了点小状况，请稍后再试。" });
      writeSse(res, "done", { sessionId: null });
      res.end();
    }
  } catch (error) {
    next(error);
  }
});

export { router as chatRouter };

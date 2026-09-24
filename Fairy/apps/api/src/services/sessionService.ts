import { prisma, type Prisma } from "@fairy/database";
import type { ChatEvent, ChatMessageDto, ChatMessagePayload, SessionListItem } from "@fairy/shared";

export type SessionErrorCode = "SESSION_NOT_FOUND" | "SESSION_FORBIDDEN";

export type SessionErrorResult = { ok: false; code: SessionErrorCode };

export type OwnedSessionResult = { ok: true; id: string; title: string } | SessionErrorResult;

export type SessionMessagesResult = { ok: true; messages: ChatMessageDto[] } | SessionErrorResult;

export interface AppendTurnInput {
  userContent: string;
  assistantContent: string;
  events: ChatEvent[];
}

const TITLE_MAX_LENGTH = 20;

function deriveTitle(userContent: string): string {
  const trimmed = userContent.trim();
  return trimmed.slice(0, TITLE_MAX_LENGTH);
}

export async function createSession(userId: string): Promise<SessionListItem> {
  const session = await prisma.session.create({
    data: { userId, title: "" },
  });
  return {
    id: session.id,
    title: session.title,
    messageCount: 0,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export async function listSessions(userId: string): Promise<SessionListItem[]> {
  const sessions = await prisma.session.findMany({
    where: { userId },
    include: { _count: { select: { messages: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    messageCount: session._count.messages,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }));
}

export async function getOwnedSession(
  userId: string,
  sessionId: string,
): Promise<OwnedSessionResult> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    return { ok: false, code: "SESSION_NOT_FOUND" };
  }
  if (session.userId !== userId) {
    return { ok: false, code: "SESSION_FORBIDDEN" };
  }
  return { ok: true, id: session.id, title: session.title };
}

export async function getSessionMessages(
  userId: string,
  sessionId: string,
): Promise<SessionMessagesResult> {
  const owned = await getOwnedSession(userId, sessionId);
  if (!owned.ok) {
    return owned;
  }

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  return {
    ok: true,
    messages: messages.map((message) => ({
      id: message.id,
      sessionId: message.sessionId,
      role: message.role === "ASSISTANT" ? "assistant" : "user",
      content: message.content,
      payload: (message.payload as ChatMessagePayload | null) ?? null,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export async function getRecentMessages(
  userId: string,
  sessionId: string,
  take = 10,
): Promise<HistoryTurn[]> {
  const owned = await getOwnedSession(userId, sessionId);
  if (!owned.ok) {
    return [];
  }

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take,
  });

  return messages.reverse().map((message) => ({
    role: message.role === "ASSISTANT" ? "assistant" : "user",
    content: message.content,
  }));
}

export async function appendTurn(
  userId: string,
  sessionId: string,
  input: AppendTurnInput,
): Promise<{ ok: true } | SessionErrorResult> {
  const owned = await getOwnedSession(userId, sessionId);
  if (!owned.ok) {
    return owned;
  }

  await prisma.$transaction(async (tx) => {
    // title 取现有值或首条非空用户消息前 20 字；顺带 touch updatedAt 让列表排序刷新
    const title = owned.title || deriveTitle(input.userContent);
    await tx.session.update({
      where: { id: sessionId },
      data: { title },
    });
    await tx.chatMessage.create({
      data: { sessionId, role: "USER", content: input.userContent },
    });
    await tx.chatMessage.create({
      data: {
        sessionId,
        role: "ASSISTANT",
        content: input.assistantContent,
        payload: { events: input.events } as Prisma.InputJsonValue,
      },
    });
  });

  return { ok: true };
}

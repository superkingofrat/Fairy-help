import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import {
  appendTurn,
  createSession,
  getOwnedSession,
  getRecentMessages,
  getSessionMessages,
  listSessions,
} from "../services/sessionService";

vi.mock("@fairy/database", () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_USER_ID = "22222222-0000-4000-8000-000000000002";

const sessionRow = {
  id: SESSION_ID,
  userId: USER_ID,
  title: "雨天",
  createdAt: new Date("2026-09-01T08:00:00Z"),
  updatedAt: new Date("2026-09-01T09:00:00Z"),
};

const messageRow = {
  id: "770e8400-e29b-41d4-a716-446655440000",
  sessionId: SESSION_ID,
  role: "ASSISTANT",
  content: "找到了",
  payload: { events: [{ type: "recommendation", items: [] }] },
  createdAt: new Date("2026-09-01T09:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSession", () => {
  it("creates an empty-title session and maps the row to a list item", async () => {
    vi.mocked(prisma.session.create).mockResolvedValue(sessionRow as never);

    const result = await createSession(USER_ID);

    expect(prisma.session.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, title: "" },
    });
    expect(result).toEqual({
      id: SESSION_ID,
      title: "雨天",
      messageCount: 0,
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T09:00:00.000Z",
    });
  });
});

describe("listSessions", () => {
  it("queries by user, orders by updatedAt desc, and maps message counts", async () => {
    vi.mocked(prisma.session.findMany).mockResolvedValue([
      { ...sessionRow, _count: { messages: 3 } },
      { ...sessionRow, id: "660e8400-e29b-41d4-a716-446655440000", _count: { messages: 0 } },
    ] as never);

    const result = await listSessions(USER_ID);

    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      include: { _count: { select: { messages: true } } },
      orderBy: { updatedAt: "desc" },
    });
    expect(result.map((session) => session.messageCount)).toEqual([3, 0]);
  });
});

describe("getOwnedSession", () => {
  it("returns SESSION_NOT_FOUND when the session does not exist", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null as never);

    const result = await getOwnedSession(USER_ID, SESSION_ID);

    expect(result).toEqual({ ok: false, code: "SESSION_NOT_FOUND" });
  });

  it("returns SESSION_FORBIDDEN when the session belongs to another user", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...sessionRow,
      userId: OTHER_USER_ID,
    } as never);

    const result = await getOwnedSession(USER_ID, SESSION_ID);

    expect(result).toEqual({ ok: false, code: "SESSION_FORBIDDEN" });
  });

  it("returns the owned session", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);

    const result = await getOwnedSession(USER_ID, SESSION_ID);

    expect(result).toEqual({ ok: true, id: SESSION_ID, title: "雨天" });
  });
});

describe("getSessionMessages", () => {
  it("maps roles and passes payload through", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      messageRow,
      {
        ...messageRow,
        id: "880e8400-e29b-41d4-a716-446655440000",
        role: "USER",
        content: "雨天",
        payload: null,
      },
    ] as never);

    const result = await getSessionMessages(USER_ID, SESSION_ID);

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      orderBy: { createdAt: "asc" },
    });
    expect(result).toEqual({
      ok: true,
      messages: [
        {
          id: messageRow.id,
          sessionId: SESSION_ID,
          role: "assistant",
          content: "找到了",
          payload: { events: [{ type: "recommendation", items: [] }] },
          createdAt: "2026-09-01T09:00:00.000Z",
        },
        {
          id: "880e8400-e29b-41d4-a716-446655440000",
          sessionId: SESSION_ID,
          role: "user",
          content: "雨天",
          payload: null,
          createdAt: "2026-09-01T09:00:00.000Z",
        },
      ],
    });
  });

  it("returns the ownership error without querying messages", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null as never);

    const result = await getSessionMessages(USER_ID, SESSION_ID);

    expect(result).toEqual({ ok: false, code: "SESSION_NOT_FOUND" });
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });
});

describe("getRecentMessages", () => {
  it("takes the latest N descending then reverses to ascending order", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);
    // findMany 按 createdAt desc 返回（新的在前）：assistant 回复新于 user 消息
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      { ...messageRow, id: "880e8400-e29b-41d4-a716-446655440000", role: "ASSISTANT", content: "第一条回复" },
      { ...messageRow, role: "USER", content: "第二条" },
    ] as never);

    const result = await getRecentMessages(USER_ID, SESSION_ID, 10);

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    expect(result).toEqual([
      { role: "user", content: "第二条" },
      { role: "assistant", content: "第一条回复" },
    ]);
  });

  it("returns [] when the session is not owned", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null as never);

    const result = await getRecentMessages(USER_ID, SESSION_ID);

    expect(result).toEqual([]);
  });
});

describe("appendTurn", () => {
  const tx = {
    session: { update: vi.fn() },
    chatMessage: { create: vi.fn() },
  };

  beforeEach(() => {
    tx.session.update.mockResolvedValue(sessionRow as never);
    tx.chatMessage.create.mockResolvedValue(messageRow as never);
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as unknown as typeof prisma.$transaction
    );
  });

  it("writes title, USER and ASSISTANT messages in one transaction", async () => {
    // 空标题会话：标题从首条用户消息派生
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...sessionRow,
      title: "",
    } as never);

    const result = await appendTurn(USER_ID, SESSION_ID, {
      userContent: "  雨天想看点治愈的  ",
      assistantContent: "为你找到这些片子",
      events: [{ type: "recommendation", items: [] }],
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // 标题取首条非空用户消息，trim 后前 20 字
    expect(tx.session.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { title: "雨天想看点治愈的" },
    });
    expect(tx.chatMessage.create).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(tx.chatMessage.create).mock.calls;
    expect(calls[0][0]).toMatchObject({
      data: { sessionId: SESSION_ID, role: "USER", content: "  雨天想看点治愈的  " },
    });
    expect(calls[1][0]).toMatchObject({
      data: {
        sessionId: SESSION_ID,
        role: "ASSISTANT",
        content: "为你找到这些片子",
        payload: { events: [{ type: "recommendation", items: [] }] },
      },
    });
  });

  it("keeps an existing title instead of overwriting it", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...sessionRow,
      title: "已有标题",
    } as never);

    await appendTurn(USER_ID, SESSION_ID, {
      userContent: "再聊一部",
      assistantContent: "好的",
      events: [],
    });

    expect(tx.session.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { title: "已有标题" },
    });
  });

  it("truncates a derived title to 20 characters", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({ ...sessionRow, title: "" } as never);

    const longMessage = "一二三四五六七八九十一二三四五六七八九十一二三四五";
    await appendTurn(USER_ID, SESSION_ID, {
      userContent: longMessage,
      assistantContent: "好的",
      events: [],
    });

    expect(tx.session.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { title: "一二三四五六七八九十一二三四五六七八九十" },
    });
  });

  it("returns the ownership error without touching the transaction", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null as never);

    const result = await appendTurn(USER_ID, SESSION_ID, {
      userContent: "hi",
      assistantContent: "hi",
      events: [],
    });

    expect(result).toEqual({ ok: false, code: "SESSION_NOT_FOUND" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPage } from "../components/chat/ChatPage";
import { RecommendationCard } from "../components/chat/RecommendationCard";
import * as chatApi from "../lib/chatApi";
import { parseSseBuffer } from "../lib/chatApi";
import { ApiRequestError } from "../lib/http";
import * as sessionApi from "../lib/sessionApi";
import * as memoryApi from "../lib/memoryApi";
import { listRentals } from "../lib/rentalsApi";
import { useChatStore } from "../stores/chatStore";
import type { ChatMessageDto, Movie, SessionListItem, TripResult } from "@fairy/shared";

vi.mock("../lib/chatApi", async () => {
  const actual = await vi.importActual<typeof import("../lib/chatApi")>("../lib/chatApi");
  return {
    ...actual,
    postChat: vi.fn(),
  };
});
vi.mock("../lib/rentalsApi");
vi.mock("../lib/sessionApi");
vi.mock("../lib/memoryApi");

const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_ID = "660e8400-e29b-41d4-a716-446655440000";
const OTHER_SESSION_ID = "770e8400-e29b-41d4-a716-446655440000";
const SESSION_STORAGE_KEY = "fairy.sessionId";

const activeRental = {
  rentalId: "880e8400-e29b-41d4-a716-446655440000",
  movieId: MOVIE_ID,
  movieTitle: "盗梦空间",
  status: "ACTIVE" as const,
  borrowedAt: "2026-08-30T00:00:00.000Z",
  returnedAt: null,
};

const movie: Movie = {
  id: MOVIE_ID,
  title: "盗梦空间",
  director: "Christopher Nolan",
  year: 2010,
  mood: ["悬疑"],
  scene: ["失眠夜"],
  genres: ["科幻"],
  quote: null,
  stock: 2,
  totalStock: 3,
  coverUrl: null,
  description: "测试",
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

const sampleSession: SessionListItem = {
  id: SESSION_ID,
  title: "雨天",
  messageCount: 1,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T09:00:00.000Z",
};

const assistantDto: ChatMessageDto = {
  id: "990e8400-e29b-41d4-a716-446655440000",
  sessionId: SESSION_ID,
  role: "assistant",
  content: "找到了这些片子",
  payload: {
    events: [{ type: "recommendation", items: [movie] }],
  },
  createdAt: "2026-09-01T09:00:00.000Z",
};

const tripResult: TripResult = {
  tripId: "550e8400-e29b-41d4-a716-446655440000",
  destination: "杭州",
  days: 1,
  itinerary: [
    {
      day: 1,
      title: "西湖经典一日",
      steps: [
        {
          time: "09:00",
          name: "西湖",
          category: "景点",
          note: null,
          location: { lng: 120.15, lat: 30.25 },
          validated: true,
        },
      ],
    },
  ],
  route: null,
  validated: true,
  companion: null,
};

afterEach(() => {
  cleanup();
  useChatStore.setState({ activeRentals: [] });
  localStorage.clear();
});

describe("parseSseBuffer", () => {
  it("parses a complete event", () => {
    const parsed = parseSseBuffer('event: text\ndata: {"content":"hi"}\n\n');
    expect(parsed.events[0]).toEqual({ event: "text", data: { content: "hi" } });
  });
});

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listRentals).mockResolvedValue([]);
    vi.mocked(sessionApi.listSessions).mockResolvedValue([]);
    vi.mocked(sessionApi.createSession).mockResolvedValue(sampleSession);
    vi.mocked(sessionApi.getSessionMessages).mockResolvedValue([]);
    vi.mocked(memoryApi.listMyMemories).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it("posts movieId when borrowing from a card", async () => {
    vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
      onEvent({
        event: "recommendation",
        data: {
          items: [
            {
              id: MOVIE_ID,
              title: "星际穿越",
              director: "Nolan",
              year: 2014,
              mood: ["治愈"],
              scene: ["雨天"],
              genres: ["科幻"],
              quote: null,
              stock: 2,
              totalStock: 3,
              coverUrl: null,
              description: "",
              createdAt: "2024-01-10T08:00:00Z",
              updatedAt: "2024-08-01T12:30:00Z",
            },
          ],
        },
      });
      onEvent({ event: "text", data: { content: "找到了" } });
      onEvent({ event: "done", data: {} });
    });

    render(<ChatPage />);
    fireEvent.change(screen.getByPlaceholderText("和 Fairy 说点什么吧..."), {
      target: { value: "雨天" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("星际穿越")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "借阅" }));

    await waitFor(() =>
      expect(chatApi.postChat).toHaveBeenLastCalledWith(
        { message: "", movieId: MOVIE_ID, sessionId: SESSION_ID },
        expect.any(Function),
      ),
    );
  });

  it("lists active rentals with a return control", async () => {
    vi.mocked(listRentals).mockResolvedValue([activeRental]);

    render(<ChatPage />);

    expect(await screen.findByText("我的借阅")).toBeDefined();
    expect(screen.getByText("盗梦空间")).toBeDefined();
    expect(screen.getByRole("button", { name: "归还" })).toBeDefined();
  });

  it("hides the strip entirely when there are no active rentals", async () => {
    vi.mocked(listRentals).mockResolvedValue([]);

    render(<ChatPage />);

    await waitFor(() => expect(listRentals).toHaveBeenCalled());
    expect(screen.queryByText("我的借阅")).toBeNull();
  });

  it("sends an action return request and removes the chip on success", async () => {
    vi.mocked(listRentals).mockResolvedValueOnce([activeRental]).mockResolvedValue([]);
    vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
      onEvent({
        event: "return",
        data: { success: true, rentalId: activeRental.rentalId, remainingStock: 3, code: "OK" },
      });
      onEvent({ event: "text", data: { content: "已归还" } });
      onEvent({ event: "done", data: {} });
    });

    render(<ChatPage />);

    fireEvent.click(await screen.findByRole("button", { name: "归还" }));

    await waitFor(() =>
      expect(chatApi.postChat).toHaveBeenLastCalledWith(
        { message: "", movieId: MOVIE_ID, action: "return" },
        expect.any(Function),
      ),
    );
    expect(sessionApi.createSession).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("盗梦空间")).toBeNull());
  });

  it("creates a session before the first message and sends its sessionId", async () => {
    vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
      onEvent({ event: "text", data: { content: "你好" } });
      onEvent({ event: "done", data: {} });
    });

    render(<ChatPage />);
    fireEvent.change(screen.getByPlaceholderText("和 Fairy 说点什么吧..."), {
      target: { value: "你好呀" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(sessionApi.createSession).toHaveBeenCalled());
    expect(chatApi.postChat).toHaveBeenLastCalledWith(
      { message: "你好呀", sessionId: SESSION_ID },
      expect.any(Function),
    );
  });

  it("shows a localized message instead of the raw error when the request fails", async () => {
    vi.mocked(chatApi.postChat).mockRejectedValue(
      new ApiRequestError("chat request timed out", "TIMEOUT"),
    );

    render(<ChatPage />);
    fireEvent.change(screen.getByPlaceholderText("和 Fairy 说点什么吧..."), {
      target: { value: "你好呀" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("对话超时，请重试")).toBeDefined();
    // 乐观插入的用户消息保留，失败时不再残留空的 Fairy 气泡
    expect(screen.getByText("你好呀")).toBeDefined();
  });

  it("shows the empty state when there are no sessions", async () => {
    render(<ChatPage />);

    expect(await screen.findByText("还没有会话，点「新建」开始聊天")).toBeDefined();
  });

  it("restores the stored session and replays text and cards", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    vi.mocked(sessionApi.listSessions).mockResolvedValue([sampleSession]);
    vi.mocked(sessionApi.getSessionMessages).mockResolvedValue([assistantDto]);

    render(<ChatPage />);

    expect(await screen.findByText("找到了这些片子")).toBeDefined();
    expect(screen.getByText("盗梦空间")).toBeDefined();
    expect(sessionApi.getSessionMessages).toHaveBeenCalledWith(SESSION_ID);

    fireEvent.click(screen.getByRole("button", { name: "借阅" }));
    await waitFor(() =>
      expect(chatApi.postChat).toHaveBeenLastCalledWith(
        { message: "", movieId: MOVIE_ID, sessionId: SESSION_ID },
        expect.any(Function),
      ),
    );
  });

  it("opens a session from the sidebar", async () => {
    vi.mocked(sessionApi.listSessions).mockResolvedValue([
      sampleSession,
      { ...sampleSession, id: OTHER_SESSION_ID, title: "通勤" },
    ]);

    render(<ChatPage />);

    fireEvent.click(await screen.findByText("通勤"));

    await waitFor(() =>
      expect(sessionApi.getSessionMessages).toHaveBeenCalledWith(OTHER_SESSION_ID),
    );
  });

  it("creates and switches to a blank session via the new button", async () => {
    vi.mocked(sessionApi.createSession).mockResolvedValue({
      ...sampleSession,
      id: OTHER_SESSION_ID,
      title: "",
      messageCount: 0,
    });

    render(<ChatPage />);

    fireEvent.click(await screen.findByRole("button", { name: "新建" }));

    expect(sessionApi.createSession).toHaveBeenCalled();
    expect(await screen.findByText("新会话")).toBeDefined();
  });

  it("replays a stored trip timeline from the session payload (FU-13)", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    vi.mocked(sessionApi.listSessions).mockResolvedValue([sampleSession]);
    vi.mocked(sessionApi.getSessionMessages).mockResolvedValue([
      {
        ...assistantDto,
        content: "给你规划了「杭州」1 天的行程",
        payload: { events: [{ type: "trip", trip: tripResult }] },
      },
    ]);

    render(<ChatPage />);

    expect(await screen.findByText(/行程规划/)).toBeDefined();
    expect(screen.getByText("西湖")).toBeDefined();
    expect(screen.getAllByText(/杭州/).length).toBeGreaterThan(0);
  });

  it("renders a trip card from a live trip SSE event (FU-13)", async () => {
    vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
      onEvent({ event: "text", data: { content: "给你规划了「杭州」1 天的行程。" } });
      onEvent({ event: "trip", data: { trip: tripResult } });
      onEvent({ event: "done", data: {} });
    });

    render(<ChatPage />);
    fireEvent.change(screen.getByPlaceholderText("和 Fairy 说点什么吧..."), {
      target: { value: "帮我规划周末去杭州玩" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("西湖")).toBeDefined();
    expect(screen.getByText("地点已核实")).toBeDefined();
  });

  it("toggles the memory self-inspection panel from the header (FU-17)", async () => {
    render(<ChatPage />);

    const toggle = screen.getByRole("button", { name: "Fairy 记住了什么" });
    fireEvent.click(toggle);

    expect(await screen.findByText("Fairy 还没有记住关于你的内容")).toBeDefined();
    expect(memoryApi.listMyMemories).toHaveBeenCalledWith({ page: 1, limit: 20 });

    fireEvent.click(screen.getByRole("button", { name: "Fairy 记住了什么" }));
    expect(screen.queryByText("Fairy 还没有记住关于你的内容")).toBeNull();
  });
});

describe("ChatPage Fairy expression wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listRentals).mockResolvedValue([]);
    vi.mocked(sessionApi.listSessions).mockResolvedValue([]);
    vi.mocked(sessionApi.createSession).mockResolvedValue(sampleSession);
    vi.mocked(sessionApi.getSessionMessages).mockResolvedValue([]);
    vi.mocked(memoryApi.listMyMemories).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  function typeAndSend(message: string): void {
    fireEvent.change(screen.getByPlaceholderText("和 Fairy 说点什么吧..."), {
      target: { value: message },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
  }

  it("shows the header Fairy avatar on idle before any message", async () => {
    render(<ChatPage />);

    expect(await screen.findByLabelText("Fairy 待机中")).toBeDefined();
  });

  it("walks thinking → speaking → idle as the stream progresses", async () => {
    let releaseSession!: () => void;
    vi.mocked(sessionApi.createSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSession = () => resolve(sampleSession);
        }),
    );
    let releaseStream!: () => void;
    vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
      onEvent({ event: "text", data: { content: "你好" } });
      await new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      onEvent({ event: "done", data: {} });
    });

    render(<ChatPage />);
    typeAndSend("你好呀");

    // 忙碌但还没有首个 token：思考
    await waitFor(() => expect(screen.getByLabelText("Fairy 思考中")).toBeDefined());
    releaseSession();
    // 流式输出中：说话
    await waitFor(() => expect(screen.getByLabelText("Fairy 正在回答")).toBeDefined());
    releaseStream();
    // 流结束：回待机
    await waitFor(() => expect(screen.getByLabelText("Fairy 待机中")).toBeDefined());
  });

  it("celebrates briefly after a successful borrow and then returns to idle", async () => {
    render(<ChatPage />);
    await screen.findByPlaceholderText("和 Fairy 说点什么吧...");

    vi.useFakeTimers();
    try {
      vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
        onEvent({
          event: "borrow",
          data: { success: true, remainingStock: 1, rentalId: "r1", code: "OK" },
        });
        onEvent({ event: "text", data: { content: "借好了" } });
        onEvent({ event: "done", data: {} });
      });

      typeAndSend("借盗梦空间");
      await act(async () => {});

      expect(screen.getByLabelText("Fairy 心情很好")).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByLabelText("Fairy 待机中")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not celebrate when the borrow fails", async () => {
    vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
      onEvent({
        event: "borrow",
        data: { success: false, remainingStock: 0, rentalId: null, code: "OUT_OF_STOCK" },
      });
      onEvent({ event: "text", data: { content: "没库存了" } });
      onEvent({ event: "done", data: {} });
    });

    render(<ChatPage />);
    typeAndSend("借盗梦空间");

    expect(await screen.findByText("该影片暂时缺货。")).toBeDefined();
    expect(screen.getByLabelText("Fairy 待机中")).toBeDefined();
  });

  it("renders a decorative avatar next to fairy messages only", async () => {
    vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
      onEvent({ event: "text", data: { content: "你好" } });
      onEvent({ event: "done", data: {} });
    });

    render(<ChatPage />);
    typeAndSend("你好呀");

    expect(await screen.findByText("你好")).toBeDefined();
    const decorative = screen.getAllByTestId("fairy-avatar-decorative");
    expect(decorative.length).toBe(1);
    expect(decorative[0].getAttribute("aria-hidden")).toBe("true");
  });
});

describe("RecommendationCard quote display", () => {
  it("shows the classic quote when the movie has one", () => {
    render(
      <RecommendationCard
        movie={{ ...movie, quote: "不要回头，一直向前走。" }}
        disabled={false}
        onBorrow={vi.fn()}
      />,
    );

    expect(screen.getByText("「不要回头，一直向前走。」")).toBeDefined();
  });

  it("renders no quote line when the movie has none", () => {
    const { container } = render(
      <RecommendationCard movie={{ ...movie, quote: null }} disabled={false} onBorrow={vi.fn()} />,
    );

    expect(container.querySelectorAll("p.italic").length).toBe(0);
  });

  it("treats a blank quote as absent", () => {
    const { container } = render(
      <RecommendationCard movie={{ ...movie, quote: "   " }} disabled={false} onBorrow={vi.fn()} />,
    );

    expect(container.querySelectorAll("p.italic").length).toBe(0);
  });
});

describe("RecommendationCard borrow/return toggle", () => {
  it("shows borrow for a movie that is not borrowed", () => {
    const onBorrow = vi.fn();
    render(<RecommendationCard movie={movie} disabled={false} onBorrow={onBorrow} />);

    fireEvent.click(screen.getByRole("button", { name: "借阅" }));
    expect(onBorrow).toHaveBeenCalledWith(MOVIE_ID);
  });
  it("shows return for a borrowed movie and stays enabled at zero stock", () => {
    const onReturn = vi.fn();
    render(
      <RecommendationCard
        movie={{ ...movie, stock: 0 }}
        disabled={false}
        isBorrowed
        onBorrow={vi.fn()}
        onReturn={onReturn}
      />,
    );

    const button = screen.getByRole("button", { name: "归还" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onReturn).toHaveBeenCalledWith(MOVIE_ID);
    expect(screen.queryByRole("button", { name: "借阅" })).toBeNull();
  });
});

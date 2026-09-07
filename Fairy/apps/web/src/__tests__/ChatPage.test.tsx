import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPage } from "../components/chat/ChatPage";
import { RecommendationCard } from "../components/chat/RecommendationCard";
import * as chatApi from "../lib/chatApi";
import { parseSseBuffer } from "../lib/chatApi";
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
};

afterEach(() => {
  cleanup();
  useChatStore.setState({ messages: [], activeRentals: [] });
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
        expect.any(Function)
      )
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
        expect.any(Function)
      )
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
      expect.any(Function)
    );
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
        expect.any(Function)
      )
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
      expect(sessionApi.getSessionMessages).toHaveBeenCalledWith(OTHER_SESSION_ID)
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
      />
    );

    const button = screen.getByRole("button", { name: "归还" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onReturn).toHaveBeenCalledWith(MOVIE_ID);
    expect(screen.queryByRole("button", { name: "借阅" })).toBeNull();
  });
});

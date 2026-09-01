import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPage } from "../components/chat/ChatPage";
import { RecommendationCard } from "../components/chat/RecommendationCard";
import * as chatApi from "../lib/chatApi";
import { parseSseBuffer } from "../lib/chatApi";
import { listRentals } from "../lib/rentalsApi";
import { useChatStore } from "../stores/chatStore";
import type { Movie } from "@fairy/shared";

vi.mock("../lib/chatApi", async () => {
  const actual = await vi.importActual<typeof import("../lib/chatApi")>("../lib/chatApi");
  return {
    ...actual,
    postChat: vi.fn(),
  };
});
vi.mock("../lib/rentalsApi");

const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";

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

afterEach(() => {
  cleanup();
  useChatStore.setState({ messages: [], activeRentals: [] });
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
  });

  it("posts movieId when borrowing from a card", async () => {
    vi.mocked(chatApi.postChat).mockImplementation(async (_body, onEvent) => {
      onEvent({
        event: "recommendation",
        data: {
          items: [
            {
              id: "550e8400-e29b-41d4-a716-446655440000",
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

    expect(chatApi.postChat).toHaveBeenLastCalledWith(
      { message: "", movieId: "550e8400-e29b-41d4-a716-446655440000" },
      expect.any(Function)
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

    expect(chatApi.postChat).toHaveBeenLastCalledWith(
      { message: "", movieId: MOVIE_ID, action: "return" },
      expect.any(Function)
    );
    await waitFor(() => expect(screen.queryByText("盗梦空间")).toBeNull());
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

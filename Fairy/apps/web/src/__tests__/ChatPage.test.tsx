import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatPage } from "../components/chat/ChatPage";
import * as chatApi from "../lib/chatApi";
import { parseSseBuffer } from "../lib/chatApi";

vi.mock("../lib/chatApi", async () => {
  const actual = await vi.importActual<typeof import("../lib/chatApi")>("../lib/chatApi");
  return {
    ...actual,
    postChat: vi.fn(),
  };
});

describe("parseSseBuffer", () => {
  it("parses a complete event", () => {
    const parsed = parseSseBuffer('event: text\ndata: {"content":"hi"}\n\n');
    expect(parsed.events[0]).toEqual({ event: "text", data: { content: "hi" } });
  });
});

describe("ChatPage", () => {
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MemorySelfListFeed, MemorySelfListItem } from "@fairy/shared";
import { listMyMemories } from "../../lib/memoryApi";
import { MemorySelfPanel } from "./MemorySelfPanel";

vi.mock("../../lib/memoryApi");

const selfItem = (over: Partial<MemorySelfListItem> = {}): MemorySelfListItem => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  kind: "preference",
  content: "喜欢王家卫的电影",
  sessionId: null,
  createdAt: "2026-09-01T09:00:00.000Z",
  ...over,
});

const emptyFeed: MemorySelfListFeed = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

function feed(items: MemorySelfListItem[], totalPages: number): MemorySelfListFeed {
  return { items, pagination: { page: 1, limit: 20, total: items.length, totalPages } };
}

describe("MemorySelfPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMyMemories).mockResolvedValue(emptyFeed);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders kind chips and origin labels from sessionId (FU-17)", async () => {
    vi.mocked(listMyMemories).mockResolvedValue(
      feed(
        [
          selfItem({
            id: "a",
            kind: "preference",
            content: "喜欢王家卫的电影",
            sessionId: "660e8400-e29b-41d4-a716-446655440000",
          }),
          selfItem({ id: "b", kind: "fact", content: "住在上海", sessionId: null }),
        ],
        1,
      ),
    );

    render(<MemorySelfPanel />);

    expect(await screen.findByText("喜欢王家卫的电影")).toBeDefined();
    expect(screen.getByText("偏好")).toBeDefined();
    expect(screen.getByText("对话抽取")).toBeDefined();
    expect(screen.getByText("住在上海")).toBeDefined();
    expect(screen.getByText("事实")).toBeDefined();
    expect(screen.getByText("系统录入")).toBeDefined();
    expect(listMyMemories).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("shows the empty state when the user has no memories", async () => {
    render(<MemorySelfPanel />);

    expect(await screen.findByText("Fairy 还没有记住关于你的内容")).toBeDefined();
  });

  it("shows a recoverable error message when loading fails", async () => {
    vi.mocked(listMyMemories).mockRejectedValue(new Error("network"));

    render(<MemorySelfPanel />);

    expect(await screen.findByText("加载你的记忆失败，请稍后重试")).toBeDefined();
  });

  it("loads the next page through the pagination footer", async () => {
    vi.mocked(listMyMemories)
      .mockResolvedValueOnce(feed([selfItem({ id: "a", content: "第一页的记忆" })], 2))
      .mockResolvedValueOnce(feed([selfItem({ id: "b", content: "第二页的记忆" })], 2));

    render(<MemorySelfPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "下一页" }));

    expect(await screen.findByText("第二页的记忆")).toBeDefined();
    expect(listMyMemories).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
  });
});

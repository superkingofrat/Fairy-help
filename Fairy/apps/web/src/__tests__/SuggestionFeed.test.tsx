import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SuggestionFeed } from "../components/admin/SuggestionFeed";
import * as suggestionApi from "../lib/suggestionApi";
import type { Suggestion, SuggestionListFeed } from "@fairy/shared";

vi.mock("../lib/suggestionApi");

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "s1",
    kind: "LOW_STOCK",
    summary: "《教父》库存告急",
    body: "目前仅剩 0 盒在库，建议尽快补货。",
    sourceData: { movieId: "m1", title: "教父", stock: 0, totalStock: 2 },
    readAt: null,
    createdAt: "2026-09-23T04:00:00.000Z",
    ...overrides,
  };
}

function feed(items: Suggestion[]): SuggestionListFeed {
  return { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } };
}

describe("SuggestionFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the stream newest first with kind labels and unread badge", async () => {
    vi.mocked(suggestionApi.listSuggestions).mockResolvedValue(
      feed([
        suggestion({
          id: "s2",
          kind: "DAILY_REPORT",
          summary: "经营日报 · 2026-09-23",
          body: "今日在借 4 盒，借出率 40%。",
        }),
        suggestion({ id: "s1" }),
      ]),
    );
    vi.mocked(suggestionApi.getUnreadCount).mockResolvedValue({ count: 2 });

    render(<SuggestionFeed />);

    expect(await screen.findByText("运营建议")).toBeDefined();
    expect(screen.getByTestId("suggestion-unread-badge").textContent).toBe("2 条未读");
    expect(screen.getByText("经营日报 · 2026-09-23")).toBeDefined();
    expect(screen.getByText("低库存预警")).toBeDefined();
    expect(screen.getByText("目前仅剩 0 盒在库，建议尽快补货。")).toBeDefined();
  });

  it("marks a single suggestion read and clears its unread highlight", async () => {
    vi.mocked(suggestionApi.listSuggestions).mockResolvedValue(feed([suggestion()]));
    vi.mocked(suggestionApi.getUnreadCount).mockResolvedValue({ count: 1 });
    vi.mocked(suggestionApi.markSuggestionRead).mockResolvedValue(
      suggestion({ readAt: "2026-09-23T06:00:00.000Z" }),
    );

    render(<SuggestionFeed />);
    const markButton = await screen.findByText("标记已读");
    fireEvent.click(markButton);

    // 未读高亮与「标记已读」入口随本地态即时消失，未读数徽标清零
    await waitFor(() => expect(screen.queryByText("标记已读")).toBeNull());
    expect(screen.queryByTestId("suggestion-unread-badge")).toBeNull();
    expect(suggestionApi.markSuggestionRead).toHaveBeenCalledWith("s1");
  });

  it("marks every unread item on the page read via serial PATCH calls", async () => {
    vi.mocked(suggestionApi.listSuggestions).mockResolvedValue(
      feed([suggestion({ id: "s1" }), suggestion({ id: "s2", kind: "DORMANT" })]),
    );
    vi.mocked(suggestionApi.getUnreadCount).mockResolvedValue({ count: 2 });
    vi.mocked(suggestionApi.markSuggestionRead).mockResolvedValue(
      suggestion({ readAt: "2026-09-23T06:00:00.000Z" }),
    );

    render(<SuggestionFeed />);
    fireEvent.click(await screen.findByText("全部已读"));

    await waitFor(() => expect(screen.queryByText("标记已读")).toBeNull());
    expect(suggestionApi.markSuggestionRead).toHaveBeenCalledTimes(2);
    expect(suggestionApi.markSuggestionRead).toHaveBeenNthCalledWith(1, "s1");
    expect(suggestionApi.markSuggestionRead).toHaveBeenNthCalledWith(2, "s2");
  });

  it("generates the daily report and reloads the stream", async () => {
    vi.mocked(suggestionApi.listSuggestions)
      .mockResolvedValueOnce(feed([]))
      .mockResolvedValueOnce(
        feed([suggestion({ id: "s3", kind: "DAILY_REPORT", summary: "经营日报 · 2026-09-23" })]),
      );
    vi.mocked(suggestionApi.getUnreadCount)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    vi.mocked(suggestionApi.generateDailySuggestion).mockResolvedValue(
      suggestion({ id: "s3", kind: "DAILY_REPORT", summary: "经营日报 · 2026-09-23" }),
    );

    render(<SuggestionFeed />);
    expect(await screen.findByText(/暂无运营建议/)).toBeDefined();

    fireEvent.click(screen.getByText("立即生成日报"));

    expect(await screen.findByText("经营日报 · 2026-09-23")).toBeDefined();
    expect(suggestionApi.generateDailySuggestion).toHaveBeenCalledTimes(1);
    expect(suggestionApi.listSuggestions).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("suggestion-unread-badge").textContent).toBe("1 条未读");
  });

  it("shows the empty state when there are no suggestions", async () => {
    vi.mocked(suggestionApi.listSuggestions).mockResolvedValue(feed([]));
    vi.mocked(suggestionApi.getUnreadCount).mockResolvedValue({ count: 0 });

    render(<SuggestionFeed />);

    expect(await screen.findByText(/暂无运营建议/)).toBeDefined();
    expect(screen.queryByText("标记已读")).toBeNull();
  });

  it("shows an error state without breaking the card", async () => {
    vi.mocked(suggestionApi.listSuggestions).mockRejectedValue(new Error("API down"));
    vi.mocked(suggestionApi.getUnreadCount).mockResolvedValue({ count: 0 });

    render(<SuggestionFeed />);

    expect(await screen.findByText("API down")).toBeDefined();
    expect(screen.getByText("运营建议")).toBeDefined();
    expect(screen.queryByText(/暂无运营建议/)).toBeNull();
  });

  it("surfaces mark-read failures as an error message", async () => {
    vi.mocked(suggestionApi.listSuggestions).mockResolvedValue(feed([suggestion()]));
    vi.mocked(suggestionApi.getUnreadCount).mockResolvedValue({ count: 1 });
    vi.mocked(suggestionApi.markSuggestionRead).mockRejectedValue(new Error("网络不稳"));

    render(<SuggestionFeed />);
    fireEvent.click(await screen.findByText("标记已读"));

    expect(await screen.findByText("网络不稳")).toBeDefined();
  });
});

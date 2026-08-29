import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BehaviorPage } from "../components/admin/BehaviorPage";
import * as behaviorApi from "../lib/behaviorApi";
import type { BehaviorLogListItem, BehaviorLogFeed } from "@fairy/shared";

vi.mock("../lib/behaviorApi");

function logItem(overrides: Partial<BehaviorLogListItem> = {}): BehaviorLogListItem {
  return {
    id: "990e8400-e29b-41d4-a716-446655440000",
    userId: "00000000-0000-4000-8000-000000000001",
    email: "user@fairy.local",
    action: "BORROW_SUCCESS",
    movieId: "550e8400-e29b-41d4-a716-446655440000",
    movieTitle: "星际穿越",
    rentalId: "880e8400-e29b-41d4-a716-446655440000",
    recommendCount: null,
    createdAt: "2026-08-29T08:00:00.000Z",
    ...overrides,
  };
}

function feed(items: BehaviorLogListItem[], totalPages = 1): BehaviorLogFeed {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages },
  };
}

describe("BehaviorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders resolved rows for admin", async () => {
    vi.mocked(behaviorApi.fetchBehaviorLogs).mockResolvedValue(
      feed([
        logItem(),
        logItem({
          id: "990e8400-e29b-41d4-a716-446655440001",
          userId: "00000000-0000-4000-8000-000000000002",
          email: "admin@fairy.local",
          action: "RECOMMEND",
          movieId: null,
          movieTitle: null,
          rentalId: null,
          recommendCount: 3,
        }),
      ])
    );

    render(<BehaviorPage />);

    expect(await screen.findByText("user@fairy.local")).toBeDefined();
    expect((await screen.findAllByText("借阅成功")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("《星际穿越》")).toBeDefined();
    expect(screen.getByText("推荐了 3 部")).toBeDefined();
  });

  it("refetches with the action filter selected", async () => {
    vi.mocked(behaviorApi.fetchBehaviorLogs).mockResolvedValue(feed([]));

    render(<BehaviorPage />);
    await screen.findByText("暂无行为记录");

    fireEvent.change(screen.getByDisplayValue("全部动作"), {
      target: { value: "RECOMMEND" },
    });

    expect(behaviorApi.fetchBehaviorLogs).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RECOMMEND", page: 1 })
    );
  });

  it("shows load errors on the page", async () => {
    vi.mocked(behaviorApi.fetchBehaviorLogs).mockRejectedValue(new Error("API down"));

    render(<BehaviorPage />);

    expect(await screen.findByText("API down")).toBeDefined();
  });

  it("disables pagination buttons on a single page", async () => {
    vi.mocked(behaviorApi.fetchBehaviorLogs).mockResolvedValue(feed([logItem()]));

    render(<BehaviorPage />);
    await screen.findByText("user@fairy.local");

    expect(screen.queryByRole("button", { name: "上一页" })).toBeNull();
    expect(screen.queryByRole("button", { name: "下一页" })).toBeNull();
  });
});

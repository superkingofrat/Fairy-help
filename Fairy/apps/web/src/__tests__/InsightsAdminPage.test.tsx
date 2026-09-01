import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InsightsAdminPage } from "../components/admin/InsightsAdminPage";
import * as insightApi from "../lib/insightApi";
import type { StoreInsightsOverview } from "@fairy/shared";

vi.mock("../lib/insightApi");

function overview(overrides: Partial<StoreInsightsOverview> = {}): StoreInsightsOverview {
  return {
    popularMovies: [
      { movieId: "m1", title: "海蒂", borrowCount: 3, recommendCount: 2, inStock: true },
      { movieId: "m2", title: "楚门的世界", borrowCount: 1, recommendCount: 0, inStock: false },
    ],
    trend: [
      { date: "2026-08-30", borrowCount: 1, returnCount: 0 },
      { date: "2026-08-31", borrowCount: 0, returnCount: 1 },
    ],
    inventory: {
      activeRentals: 2,
      borrowedRatio: 0.4,
      lowStockMovies: [{ movieId: "m2", title: "楚门的世界", stock: 0, totalStock: 2 }],
    },
    moods: [{ value: "治愈", count: 5 }],
    scenes: [{ value: "雨天", count: 4 }],
    activity: { totalUsers: 7, activeUsers7d: 3, newUsers7d: 1 },
    ...overrides,
  };
}

function emptyOverview(): StoreInsightsOverview {
  return {
    popularMovies: [],
    trend: [
      { date: "2026-08-30", borrowCount: 0, returnCount: 0 },
      { date: "2026-08-31", borrowCount: 0, returnCount: 0 },
    ],
    inventory: { activeRentals: 0, borrowedRatio: 0, lowStockMovies: [] },
    moods: [],
    scenes: [],
    activity: { totalUsers: 0, activeUsers7d: 0, newUsers7d: 0 },
  };
}

describe("InsightsAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the dashboard with popular movies, inventory, trend and activity", async () => {
    vi.mocked(insightApi.fetchInsightsOverview).mockResolvedValue(overview());

    render(<InsightsAdminPage />);

    expect(await screen.findByText("运营看板")).toBeDefined();
    expect(screen.getByText("《海蒂》")).toBeDefined();
    expect(screen.getAllByText("《楚门的世界》").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("可借")).toBeDefined();
    expect(screen.getByText("暂不可借")).toBeDefined();
    expect(screen.getByText("40%")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText("治愈")).toBeDefined();
    expect(screen.getByText("雨天")).toBeDefined();
  });

  it("shows the empty state when the store has no data", async () => {
    vi.mocked(insightApi.fetchInsightsOverview).mockResolvedValue(emptyOverview());

    render(<InsightsAdminPage />);

    expect(await screen.findByText(/暂无经营数据/)).toBeDefined();
    expect(screen.queryByText("《海蒂》")).toBeNull();
  });

  it("shows load errors on the page", async () => {
    vi.mocked(insightApi.fetchInsightsOverview).mockRejectedValue(new Error("API down"));

    render(<InsightsAdminPage />);

    expect(await screen.findByText("API down")).toBeDefined();
  });
});

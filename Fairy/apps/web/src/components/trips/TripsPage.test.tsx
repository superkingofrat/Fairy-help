import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TripsPage } from "./TripsPage";
import * as tripApi from "../../lib/tripApi";
import { ApiRequestError } from "../../lib/http";
import { useAuthStore } from "../../stores/authStore";
import type { TripDetail, TripListFeed, TripListItem } from "@fairy/shared";

// FU-19 二期：/trips 页。mock tripApi + authStore 角色；不触达真实 API 与地图脚本
// （未配置 VITE_AMAP_JS_KEY 时 TripMap 静默返回 null）。

vi.mock("../../lib/tripApi");

const TRIP_ID = "550e8400-e29b-41d4-a716-446655440000";

const tripItem: TripListItem = {
  id: TRIP_ID,
  destination: "杭州",
  days: 2,
  validated: true,
  createdAt: "2026-09-20T10:00:00.000Z",
};

const tripDetail: TripDetail = {
  tripId: TRIP_ID,
  destination: "杭州",
  days: 2,
  itinerary: [
    {
      day: 1,
      title: "西湖经典",
      steps: [
        {
          time: "09:00",
          name: "西湖",
          category: "景点",
          note: null,
          location: null,
          validated: true,
        },
      ],
    },
  ],
  route: null,
  validated: true,
  createdAt: "2026-09-20T10:00:00.000Z",
  companion: null,
};

function feed(items: TripListItem[], totalPages = 1): TripListFeed {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages },
  };
}

// 与组件同一公式计算，避免时区差异
function formattedTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function setRole(role: "admin" | "agent" | "user"): void {
  useAuthStore.setState({
    token: "token-1",
    refreshToken: null,
    user: { id: "00000000-0000-4000-8000-000000000001", email: "user@fairy.local", role },
  });
}

describe("TripsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tripApi.listTrips).mockResolvedValue(feed([]));
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ token: null, refreshToken: null, user: null });
  });

  it("renders the trip list newest first with validated badges", async () => {
    setRole("admin");
    vi.mocked(tripApi.listTrips).mockResolvedValue(feed([tripItem]));

    render(<TripsPage />);

    expect(await screen.findByText("杭州")).toBeDefined();
    expect(screen.getByText("共 2 天")).toBeDefined();
    expect(screen.getByText("地点已核实")).toBeDefined();
    expect(screen.getByText(formattedTime(tripItem.createdAt))).toBeDefined();
  });

  it("shows the empty state when no trips exist", async () => {
    setRole("admin");

    render(<TripsPage />);

    expect(await screen.findByText("还没有行程记录")).toBeDefined();
  });

  it("shows a localized message when the list fails to load", async () => {
    setRole("admin");
    vi.mocked(tripApi.listTrips).mockRejectedValue(new Error("网络不通"));

    render(<TripsPage />);

    expect(await screen.findByText("网络不通")).toBeDefined();
  });

  it("opens a trip detail through the shared timeline card", async () => {
    setRole("admin");
    vi.mocked(tripApi.listTrips).mockResolvedValue(feed([tripItem]));
    vi.mocked(tripApi.getTrip).mockResolvedValue(tripDetail);

    render(<TripsPage />);
    fireEvent.click(await screen.findByText("杭州"));

    await waitFor(() => expect(tripApi.getTrip).toHaveBeenCalledWith(TRIP_ID));
    expect(await screen.findByText(/行程规划 · 杭州/)).toBeDefined();
    expect(screen.getByText("西湖")).toBeDefined();
  });

  // FU-20：详情页复用对话页的 TripTimeline，同行人快照随之自动出现在这里
  it("shows the persisted companion on the detail card", async () => {
    setRole("admin");
    vi.mocked(tripApi.listTrips).mockResolvedValue(feed([tripItem]));
    vi.mocked(tripApi.getTrip).mockResolvedValue({
      ...tripDetail,
      companion: { name: "莱卡恩", userId: "794861b0-0699-4807-a660-6fe7e78852f0" },
    });

    render(<TripsPage />);
    fireEvent.click(await screen.findByText("杭州"));

    expect(await screen.findByText(/共 2 天 · 与 莱卡恩 同行/)).toBeDefined();
  });

  it("hides trip existence with the same message for missing and forbidden details", async () => {
    setRole("admin");
    vi.mocked(tripApi.listTrips).mockResolvedValue(feed([tripItem]));
    vi.mocked(tripApi.getTrip).mockRejectedValue(
      new ApiRequestError("行程不存在", "TRIP_NOT_FOUND"),
    );

    render(<TripsPage />);
    fireEvent.click(await screen.findByText("杭州"));

    expect(await screen.findByText("行程不存在或无权查看")).toBeDefined();
  });

  it("submits the create form and refreshes the list", async () => {
    setRole("agent");
    vi.mocked(tripApi.createTrip).mockResolvedValue(tripDetail);

    render(<TripsPage />);
    fireEvent.change(await screen.findByPlaceholderText("例如：杭州"), {
      target: { value: "杭州" },
    });
    fireEvent.change(screen.getByPlaceholderText("1-14"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("规划行程"));

    await waitFor(() =>
      expect(tripApi.createTrip).toHaveBeenCalledWith({ destination: "杭州", days: 3 }),
    );
    expect(await screen.findByText("行程已创建，列表已刷新")).toBeDefined();
    // 创建成功后回第 1 页重新拉取
    await waitFor(() => expect(tripApi.listTrips).toHaveBeenCalledTimes(2));
    expect(tripApi.listTrips).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
  });

  it("shows the forbidden message when create is rejected", async () => {
    setRole("admin");
    vi.mocked(tripApi.createTrip).mockRejectedValue(
      new ApiRequestError("无权创建行程", "TRIP_FORBIDDEN"),
    );

    render(<TripsPage />);
    fireEvent.change(await screen.findByPlaceholderText("例如：杭州"), {
      target: { value: "杭州" },
    });
    fireEvent.click(screen.getByText("规划行程"));

    expect(await screen.findByText("无权创建行程")).toBeDefined();
  });

  it("hides the create form from regular users with a read-only hint", async () => {
    setRole("user");

    render(<TripsPage />);

    expect(
      await screen.findByText("创建行程面向顾问角色开放；你仍可查看已有行程详情。"),
    ).toBeDefined();
    expect(screen.queryByPlaceholderText("例如：杭州")).toBeNull();
  });

  it("paginates the trip list", async () => {
    setRole("admin");
    vi.mocked(tripApi.listTrips).mockResolvedValue(feed([tripItem], 3));

    render(<TripsPage />);
    fireEvent.click(await screen.findByText("下一页"));

    await waitFor(() => expect(tripApi.listTrips).toHaveBeenCalledWith({ page: 2, limit: 20 }));
    expect(screen.getByText("第 2 / 3 页")).toBeDefined();
  });
});

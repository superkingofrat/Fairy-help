import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { MoviesAdminPage } from "../components/admin/MoviesAdminPage";
import * as movieApi from "../lib/movieApi";
import * as rentalsApi from "../lib/rentalsApi";
import { useAuthStore } from "../stores/authStore";

vi.mock("../lib/movieApi");
vi.mock("../lib/rentalsApi");

afterEach(() => {
  cleanup();
  useAuthStore.setState({ token: null, user: null });
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByText("Fairy")).toBeDefined();
  });

  it("renders chat navigation when logged in", () => {
    useAuthStore.setState({
      token: "t",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "user@fairy.local", role: "user" },
    });
    render(<App />);
    expect(screen.getByText("对话")).toBeDefined();
    expect(screen.getByRole("link", { name: "影片库" })).toBeDefined();
    expect(screen.queryByText("影片管理")).toBeNull();
    expect(screen.getByText("退出")).toBeDefined();
  });

  it("renders the movie library page at /movies", async () => {
    vi.mocked(rentalsApi.listRentals).mockResolvedValue([]);
    vi.mocked(movieApi.fetchMovies).mockResolvedValue({
      items: [
        {
          id: "1",
          title: "星际穿越",
          director: "Christopher Nolan",
          year: 2014,
          mood: ["治愈"],
          scene: ["雨天"],
          genres: ["科幻"],
          quote: null,
          stock: 3,
          totalStock: 5,
          coverUrl: null,
          description: "测试影片",
          createdAt: "2024-01-10T08:00:00Z",
          updatedAt: "2024-08-01T12:30:00Z",
        },
      ],
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });
    useAuthStore.setState({
      token: "t",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "user@fairy.local", role: "user" },
    });
    window.history.pushState({}, "", "/movies");
    render(<App />);
    expect(await screen.findByText("星际穿越")).toBeDefined();
  });

  it("renders admin navigation for admin role", () => {
    useAuthStore.setState({
      token: "t",
      user: { id: "00000000-0000-4000-8000-000000000002", email: "admin@fairy.local", role: "admin" },
    });
    render(<App />);
    expect(screen.getByText("影片管理")).toBeDefined();
    expect(screen.getByRole("link", { name: "影片库" })).toBeDefined();
    expect(screen.getByText("画像管理")).toBeDefined();
    expect(screen.getByText("行为流水")).toBeDefined();
  });

  it("redirects unauthenticated access of admin pages to login", () => {
    window.history.pushState({}, "", "/admin/movies");
    render(<App />);
    expect(screen.getByText("登录 Fairy")).toBeDefined();
  });
});

describe("MoviesAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(movieApi.fetchMovies).mockResolvedValue({
      items: [
        {
          id: "1",
          title: "星际穿越",
          director: "Christopher Nolan",
          year: 2014,
          mood: ["治愈", "悬疑"],
          scene: ["雨天", "失眠夜"],
          genres: ["科幻"],
          quote: null,
          stock: 3,
          totalStock: 5,
          coverUrl: null,
          description: "测试影片",
          createdAt: "2024-01-10T08:00:00Z",
          updatedAt: "2024-08-01T12:30:00Z",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it("renders movie list", async () => {
    render(
      <MemoryRouter>
        <MoviesAdminPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("星际穿越")).toBeDefined();
    expect(screen.getByText("影片库管理")).toBeDefined();
  });

  it("shows field errors in the create modal instead of only the list", async () => {
    render(
      <MemoryRouter>
        <MoviesAdminPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "新增影片" }));
    fireEvent.change(screen.getByLabelText("片名"), { target: { value: "新片" } });
    fireEvent.change(screen.getByLabelText("导演"), { target: { value: "导演" } });
    fireEvent.change(screen.getByLabelText("年份"), { target: { value: "2024" } });
    fireEvent.change(screen.getByLabelText("类型"), { target: { value: "剧情" } });
    fireEvent.change(screen.getByLabelText("可借库存"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("总库存"), { target: { value: "1" } });
    fireEvent.submit(screen.getByRole("heading", { name: "新增影片" }).closest("form") as HTMLFormElement);

    expect(await screen.findByText(/请选择 1 到 3 个心情标签/)).toBeDefined();
    expect(screen.getByText(/请选择 1 到 3 个场景标签/)).toBeDefined();
    expect(movieApi.createMovie).not.toHaveBeenCalled();
  });
});

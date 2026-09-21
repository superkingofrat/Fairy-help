import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { MoviesAdminPage } from "../components/admin/MoviesAdminPage";
import { ensureSessionOnBoot } from "../lib/authApi";
import * as movieApi from "../lib/movieApi";
import * as rentalsApi from "../lib/rentalsApi";
import { useAuthStore } from "../stores/authStore";

vi.mock("../lib/movieApi");
vi.mock("../lib/rentalsApi");
vi.mock("../lib/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/authApi")>();
  return {
    ...actual,
    // 启动门默认放行本地会话；失效分支由 http.ts 401→单飞刷新 的行为测试覆盖
    ensureSessionOnBoot: vi.fn().mockResolvedValue("ok"),
  };
});

afterEach(() => {
  cleanup();
  useAuthStore.setState({ token: null, refreshToken: null, user: null });
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByText("Fairy")).toBeDefined();
  });

  it("renders chat navigation when logged in", async () => {
    useAuthStore.setState({
      token: "t",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "user@fairy.local", role: "user" },
    });
    render(<App />);
    expect(await screen.findByText("对话")).toBeDefined();
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

  it("renders admin navigation for admin role", async () => {
    useAuthStore.setState({
      token: "t",
      user: {
        id: "00000000-0000-4000-8000-000000000002",
        email: "admin@fairy.local",
        role: "admin",
      },
    });
    render(<App />);
    expect(await screen.findByText("影片管理")).toBeDefined();
    expect(screen.getByRole("link", { name: "影片库" })).toBeDefined();
    expect(screen.getByText("画像管理")).toBeDefined();
    expect(screen.getByText("行为流水")).toBeDefined();
    expect(screen.getByText("记忆管理")).toBeDefined();
    expect(screen.getByText("运营看板")).toBeDefined();
  });

  it("shows the restore placeholder instead of internal content until the boot check settles", async () => {
    let resolveBoot!: (value: "ok" | "expired") => void;
    vi.mocked(ensureSessionOnBoot).mockReturnValueOnce(
      new Promise<"ok" | "expired">((resolve) => {
        resolveBoot = resolve;
      }),
    );
    useAuthStore.setState({
      token: "t",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "user@fairy.local", role: "user" },
    });
    window.history.pushState({}, "", "/chat");
    render(<App />);

    expect(screen.getByText("正在恢复会话…")).toBeDefined();
    expect(screen.queryByRole("link", { name: "对话" })).toBeNull();
    expect(screen.queryByText("登录 Fairy")).toBeNull();

    resolveBoot("ok");
    expect(await screen.findByRole("link", { name: "对话" })).toBeDefined();
  });

  it("lands on login without flashing internal content when the boot check fails", async () => {
    // 复刻 ensureSessionOnBoot 的「expired」语义：先清掉本地会话再让启动门就绪
    vi.mocked(ensureSessionOnBoot).mockImplementationOnce(async () => {
      useAuthStore.getState().clear();
      return "expired";
    });
    useAuthStore.setState({
      token: "t",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "user@fairy.local", role: "user" },
    });
    window.history.pushState({}, "", "/chat");
    render(<App />);

    expect(await screen.findByText("登录 Fairy")).toBeDefined();
    expect(screen.queryByRole("link", { name: "对话" })).toBeNull();
  });

  it("redirects unauthenticated access of admin pages to login", () => {
    window.history.pushState({}, "", "/admin/movies");
    render(<App />);
    expect(screen.getByText("登录 Fairy")).toBeDefined();
  });

  it("redirects unauthenticated access of the memories admin page to login", () => {
    window.history.pushState({}, "", "/admin/memories");
    render(<App />);
    expect(screen.getByText("登录 Fairy")).toBeDefined();
  });

  it("redirects non-admin access of the memories admin page to home", async () => {
    useAuthStore.setState({
      token: "t",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "user@fairy.local", role: "user" },
    });
    window.history.pushState({}, "", "/admin/memories");
    render(<App />);

    expect(await screen.findByText(/欢迎使用 Fairy/)).toBeDefined();
  });

  it("renders the register page at /register without authentication", () => {
    window.history.pushState({}, "", "/register");
    render(<App />);
    expect(screen.getByText("注册 Fairy 账号")).toBeDefined();
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
      </MemoryRouter>,
    );

    expect(await screen.findByText("星际穿越")).toBeDefined();
    expect(screen.getByText("影片库管理")).toBeDefined();
  });

  it("shows field errors in the create modal instead of only the list", async () => {
    render(
      <MemoryRouter>
        <MoviesAdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "新增影片" }));
    fireEvent.change(screen.getByLabelText("片名"), { target: { value: "新片" } });
    fireEvent.change(screen.getByLabelText("导演"), { target: { value: "导演" } });
    fireEvent.change(screen.getByLabelText("年份"), { target: { value: "2024" } });
    fireEvent.change(screen.getByLabelText("类型"), { target: { value: "剧情" } });
    fireEvent.change(screen.getByLabelText("可借库存"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("总库存"), { target: { value: "1" } });
    fireEvent.submit(
      screen.getByRole("heading", { name: "新增影片" }).closest("form") as HTMLFormElement,
    );

    expect(await screen.findByText(/请选择 1 到 3 个心情标签/)).toBeDefined();
    expect(screen.getByText(/请选择 1 到 3 个场景标签/)).toBeDefined();
    expect(movieApi.createMovie).not.toHaveBeenCalled();
  });
});

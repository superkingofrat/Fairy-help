import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MovieLibraryPage } from "./MovieLibraryPage";
import * as movieApi from "../../lib/movieApi";
import * as rentalsApi from "../../lib/rentalsApi";
import type { Movie } from "@fairy/shared";

vi.mock("../../lib/movieApi");
vi.mock("../../lib/rentalsApi");

const MOVIE_ID = "550e8400-e29b-41d4-a716-446655440000";

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
  description: "测试影片",
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

function paginated(items: Movie[], page = 1, totalPages = 1) {
  return {
    items,
    pagination: { page, limit: 12, total: items.length, totalPages },
  };
}

afterEach(() => {
  cleanup();
});

describe("MovieLibraryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rentalsApi.listRentals).mockResolvedValue([]);
    vi.mocked(movieApi.fetchMovies).mockResolvedValue(paginated([movie]));
    vi.mocked(movieApi.searchMovies).mockResolvedValue(paginated([]));
    vi.mocked(movieApi.borrowMovie).mockResolvedValue({ rentalId: "r1", remainingStock: 1 });
  });

  it("renders the paginated catalog", async () => {
    render(<MovieLibraryPage />);

    expect(await screen.findByText("盗梦空间")).toBeDefined();
    expect(movieApi.fetchMovies).toHaveBeenCalledWith(1, 12);
  });

  it("renders the cover for a movie that has one", async () => {
    vi.mocked(movieApi.fetchMovies).mockResolvedValue(
      paginated([{ ...movie, coverUrl: "/covers/盗梦空间.png" }]),
    );

    render(<MovieLibraryPage />);

    const cover = await screen.findByAltText("《盗梦空间》封面");
    expect(cover.getAttribute("src")).toBe("/covers/盗梦空间.png");
  });

  it("composes mood/scene/keyword into a search request", async () => {
    const found = { ...movie, id: "m2", title: "星际穿越" };
    vi.mocked(movieApi.searchMovies).mockResolvedValue(paginated([found]));

    render(<MovieLibraryPage />);
    await screen.findByText("盗梦空间");

    fireEvent.click(screen.getByRole("button", { name: "悬疑" }));
    fireEvent.change(screen.getByLabelText("搜索标题、导演或台词"), {
      target: { value: "星际" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    expect(await screen.findByText("星际穿越")).toBeDefined();
    expect(movieApi.searchMovies).toHaveBeenCalledWith({
      mood: "悬疑",
      scene: "",
      keyword: "星际",
      page: 1,
      limit: 12,
    });
  });

  it("reset returns to the plain catalog", async () => {
    render(<MovieLibraryPage />);
    await screen.findByText("盗梦空间");

    fireEvent.click(screen.getByRole("button", { name: "悬疑" }));
    await screen.findByText("暂无影片");
    fireEvent.click(screen.getByRole("button", { name: "重置" }));

    expect(await screen.findByText("盗梦空间")).toBeDefined();
    expect(movieApi.fetchMovies).toHaveBeenCalled();
  });

  it("marks a card borrowed after a successful REST borrow", async () => {
    render(<MovieLibraryPage />);
    await screen.findByText("盗梦空间");

    fireEvent.click(screen.getByRole("button", { name: "借阅" }));

    expect(await screen.findByText("借阅成功")).toBeDefined();
    expect(movieApi.borrowMovie).toHaveBeenCalledWith(MOVIE_ID);
    const borrowedButton = (await screen.findByRole("button", {
      name: "已借",
    })) as HTMLButtonElement;
    expect(borrowedButton.disabled).toBe(true);
  });

  it("shows an in-card friendly error when the borrow conflicts", async () => {
    const error = new Error("你已经借过这部片子，还没还呢。") as Error & { code?: string };
    error.code = "ALREADY_BORROWED";
    vi.mocked(movieApi.borrowMovie).mockRejectedValue(error);

    render(<MovieLibraryPage />);
    await screen.findByText("盗梦空间");

    fireEvent.click(screen.getByRole("button", { name: "借阅" }));

    expect(await screen.findByText("你已经借过这部片子，还没还呢。")).toBeDefined();
  });

  it("disables the borrow control for actively borrowed titles", async () => {
    vi.mocked(rentalsApi.listRentals).mockResolvedValue([
      {
        rentalId: "r1",
        movieId: MOVIE_ID,
        movieTitle: "盗梦空间",
        status: "ACTIVE",
        borrowedAt: "2026-08-30T00:00:00.000Z",
        returnedAt: null,
      },
    ]);

    render(<MovieLibraryPage />);

    const borrowedButton = (await screen.findByRole("button", {
      name: "已借",
    })) as HTMLButtonElement;
    expect(borrowedButton.disabled).toBe(true);
    expect(movieApi.borrowMovie).not.toHaveBeenCalled();
  });

  it("never renders a return control on the library page", async () => {
    render(<MovieLibraryPage />);
    await screen.findByText("盗梦空间");

    expect(screen.queryByText("归还")).toBeNull();
  });

  it("opens the movie detail when a card is clicked and closes it with Escape", async () => {
    render(<MovieLibraryPage />);
    await screen.findByText("盗梦空间");

    fireEvent.click(screen.getByRole("button", { name: "查看《盗梦空间》详情" }));

    const dialog = screen.getByRole("dialog", { name: "影片详情" });
    expect(within(dialog).getByText("测试影片")).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the card and the detail in sync after borrowing from the detail", async () => {
    render(<MovieLibraryPage />);
    await screen.findByText("盗梦空间");

    fireEvent.click(screen.getByRole("button", { name: "查看《盗梦空间》详情" }));
    const dialog = screen.getByRole("dialog", { name: "影片详情" });
    fireEvent.click(within(dialog).getByRole("button", { name: "借阅" }));

    expect(await screen.findByText("借阅成功")).toBeDefined();
    expect(movieApi.borrowMovie).toHaveBeenCalledWith(MOVIE_ID);
    const borrowedButtons = await screen.findAllByRole("button", { name: "已借" });
    expect(borrowedButtons).toHaveLength(2);
  });
});

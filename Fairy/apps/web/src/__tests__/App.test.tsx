import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { MoviesAdminPage } from "../components/admin/MoviesAdminPage";
import * as movieApi from "../lib/movieApi";

vi.mock("../lib/movieApi");

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByText("Fairy")).toBeDefined();
  });

  it("renders movies admin navigation", () => {
    render(<App />);
    expect(screen.getByText("影片管理")).toBeDefined();
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
});

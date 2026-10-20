import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MovieCard } from "./MovieCard";
import type { Movie } from "@fairy/shared";

const movie: Movie = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "盗梦空间",
  director: "Christopher Nolan",
  year: 2010,
  mood: ["悬疑"],
  scene: ["失眠夜"],
  genres: ["科幻"],
  quote: null,
  stock: 2,
  totalStock: 3,
  coverUrl: "/covers/盗梦空间.png",
  description: "测试影片",
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

afterEach(() => {
  cleanup();
});

describe("MovieCard", () => {
  it("renders the cover image when coverUrl is present", () => {
    render(<MovieCard movie={movie} status="idle" onBorrow={() => {}} />);

    const cover = screen.getByAltText("《盗梦空间》封面");
    expect(cover.getAttribute("src")).toBe("/covers/盗梦空间.png");
  });

  it("renders a placeholder instead of an image when coverUrl is null", () => {
    render(<MovieCard movie={{ ...movie, coverUrl: null }} status="idle" onBorrow={() => {}} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("盗")).toBeDefined();
  });

  it("falls back to the placeholder when the cover fails to load", () => {
    render(<MovieCard movie={movie} status="idle" onBorrow={() => {}} />);

    fireEvent.error(screen.getByAltText("《盗梦空间》封面"));

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("盗")).toBeDefined();
  });

  it("reports the borrow click with the movie id", () => {
    const onBorrow = vi.fn();
    render(<MovieCard movie={movie} status="idle" onBorrow={onBorrow} />);

    fireEvent.click(screen.getByRole("button", { name: "借阅" }));

    expect(onBorrow).toHaveBeenCalledWith(movie.id);
  });

  it("opens the detail with the movie when the card is clicked", () => {
    const onOpenDetail = vi.fn();
    render(
      <MovieCard movie={movie} status="idle" onBorrow={() => {}} onOpenDetail={onOpenDetail} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看《盗梦空间》详情" }));

    expect(onOpenDetail).toHaveBeenCalledWith(movie);
  });

  it("does not open the detail when the borrow button is clicked", () => {
    const onOpenDetail = vi.fn();
    render(
      <MovieCard movie={movie} status="idle" onBorrow={() => {}} onOpenDetail={onOpenDetail} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "借阅" }));

    expect(onOpenDetail).not.toHaveBeenCalled();
  });
});

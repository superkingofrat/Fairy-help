import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MovieDetailModal } from "./MovieDetailModal";
import type { Movie } from "@fairy/shared";

const movie: Movie = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "盗梦空间",
  director: "Christopher Nolan",
  year: 2010,
  mood: ["悬疑"],
  scene: ["失眠夜"],
  genres: ["科幻", "冒险"],
  quote: "这是测试台词。",
  stock: 2,
  totalStock: 3,
  coverUrl: "/covers/盗梦空间.png",
  description: "测试影片简介",
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-08-01T12:30:00Z",
};

function renderModal(overrides: Partial<Parameters<typeof MovieDetailModal>[0]> = {}) {
  const onBorrow = vi.fn();
  const onClose = vi.fn();
  render(
    <MovieDetailModal
      movie={movie}
      status="idle"
      onBorrow={onBorrow}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onBorrow, onClose };
}

afterEach(() => {
  cleanup();
});

describe("MovieDetailModal", () => {
  it("renders every movie field", () => {
    renderModal();

    const dialog = screen.getByRole("dialog", { name: "影片详情" });
    expect(dialog.textContent).toContain("盗梦空间");
    expect(dialog.textContent).toContain("2010 · Christopher Nolan");
    expect(dialog.textContent).toContain("科幻 / 冒险");
    expect(dialog.textContent).toContain("悬疑");
    expect(dialog.textContent).toContain("失眠夜");
    expect(dialog.textContent).toContain("2 / 3");
    expect(dialog.textContent).toContain("这是测试台词。");
    expect(dialog.textContent).toContain("测试影片简介");
    expect(screen.getByAltText("《盗梦空间》封面").getAttribute("src")).toBe(
      "/covers/盗梦空间.png",
    );
  });

  it("omits the quote row when the movie has no quote", () => {
    renderModal({ movie: { ...movie, quote: null } });

    expect(screen.getByRole("dialog").textContent).not.toContain("台词");
  });

  it("falls back to the placeholder when the cover fails to load", () => {
    renderModal();

    fireEvent.error(screen.getByAltText("《盗梦空间》封面"));

    expect(screen.queryByAltText("《盗梦空间》封面")).toBeNull();
    expect(screen.getByText("盗")).toBeDefined();
  });

  it("closes via the close button", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via a click on the overlay", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByTestId("movie-detail-overlay"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes via the Escape key", () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports the borrow click with the movie id", () => {
    const { onBorrow } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "借阅" }));

    expect(onBorrow).toHaveBeenCalledWith(movie.id);
  });

  it("disables the borrow control for an already borrowed movie", () => {
    renderModal({ status: "borrowed" });

    const borrowedButton = screen.getByRole("button", { name: "已借" }) as HTMLButtonElement;
    expect(borrowedButton.disabled).toBe(true);
  });

  it("disables the borrow control when the movie is out of stock", () => {
    renderModal({ movie: { ...movie, stock: 0 } });

    const borrowButton = screen.getByRole("button", { name: "借阅" }) as HTMLButtonElement;
    expect(borrowButton.disabled).toBe(true);
  });
});

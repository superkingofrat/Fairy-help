import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryAdminPage } from "../components/admin/MemoryAdminPage";
import * as memoryApi from "../lib/memoryApi";
import * as profileApi from "../lib/profileApi";
import type { MemoryListItem, MemoryListFeed, ProfileListItem } from "@fairy/shared";
import { DEV_ADMIN_ID, DEV_USER_ID } from "@fairy/shared";

vi.mock("../lib/memoryApi");
vi.mock("../lib/profileApi");

const USER_ID = "00000000-0000-4000-8000-000000000001";

function memoryItem(overrides: Partial<MemoryListItem> = {}): MemoryListItem {
  return {
    id: "mem-1",
    userId: USER_ID,
    email: "user@fairy.local",
    kind: "preference",
    content: "喜欢太空题材科幻片",
    sessionId: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

function feed(items: MemoryListItem[], totalPages = 1): MemoryListFeed {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages },
  };
}

function profileUser(userId: string, email: string, role: "admin" | "user"): ProfileListItem {
  return { userId, email, role, profile: null };
}

describe("MemoryAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders resolved memory rows with localized kind labels", async () => {
    vi.mocked(memoryApi.fetchMemories).mockResolvedValue(
      feed([
        memoryItem(),
        memoryItem({
          id: "mem-2",
          email: "admin@fairy.local",
          kind: "fact",
          content: "不吃香菜",
          sessionId: "session-abc123",
        }),
      ]),
    );

    render(<MemoryAdminPage />);

    expect(await screen.findByText("user@fairy.local")).toBeDefined();
    expect(screen.getByText("admin@fairy.local")).toBeDefined();
    expect(screen.getByText("喜欢太空题材科幻片")).toBeDefined();
    expect((await screen.findAllByText("偏好")).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText("事实")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("session-abc123".slice(0, 8))).toBeDefined();
  });

  it("refetches from page 1 when the kind filter changes", async () => {
    vi.mocked(memoryApi.fetchMemories).mockResolvedValue(feed([]));

    render(<MemoryAdminPage />);
    await screen.findByText("暂无记忆记录");

    fireEvent.change(screen.getByDisplayValue("全部类型"), {
      target: { value: "intent" },
    });

    expect(memoryApi.fetchMemories).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "intent", page: 1 }),
    );
  });

  it("searches content by keyword", async () => {
    vi.mocked(memoryApi.fetchMemories).mockResolvedValue(feed([]));

    render(<MemoryAdminPage />);
    await screen.findByText("暂无记忆记录");

    fireEvent.change(screen.getByPlaceholderText("搜索内容关键字"), {
      target: { value: "科幻" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    expect(memoryApi.fetchMemories).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: "科幻", page: 1 }),
    );
  });

  it("shows load errors on the page", async () => {
    vi.mocked(memoryApi.fetchMemories).mockRejectedValue(new Error("API down"));

    render(<MemoryAdminPage />);

    expect(await screen.findByText("API down")).toBeDefined();
  });

  it("moves to the next page when pagination is available", async () => {
    vi.mocked(memoryApi.fetchMemories).mockResolvedValue(feed([memoryItem()], 2));

    render(<MemoryAdminPage />);
    await screen.findByText("user@fairy.local");

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(memoryApi.fetchMemories).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("creates a memory for a selected user and reloads the list", async () => {
    vi.mocked(memoryApi.fetchMemories).mockResolvedValue(feed([memoryItem()]));
    vi.mocked(profileApi.fetchProfiles).mockResolvedValue([
      profileUser(DEV_ADMIN_ID, "admin@fairy.local", "admin"),
      profileUser(DEV_USER_ID, "user@fairy.local", "user"),
    ]);

    render(<MemoryAdminPage />);
    await screen.findByText("user@fairy.local");

    fireEvent.click(screen.getByRole("button", { name: "新增记忆" }));
    await screen.findByRole("option", { name: "admin@fairy.local" });

    fireEvent.change(screen.getByLabelText("用户"), {
      target: { value: DEV_ADMIN_ID },
    });
    fireEvent.change(screen.getByLabelText("内容"), {
      target: { value: "喜欢太空题材科幻片" },
    });
    fireEvent.submit(
      screen.getByRole("heading", { name: "新增记忆" }).closest("form") as HTMLFormElement,
    );

    await waitFor(() =>
      expect(memoryApi.createMemory).toHaveBeenCalledWith({
        userId: DEV_ADMIN_ID,
        kind: "preference",
        content: "喜欢太空题材科幻片",
      }),
    );
    expect(memoryApi.fetchMemories).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it("requires a user before creating", async () => {
    vi.mocked(memoryApi.fetchMemories).mockResolvedValue(feed([memoryItem()]));
    vi.mocked(profileApi.fetchProfiles).mockResolvedValue([
      profileUser(DEV_ADMIN_ID, "admin@fairy.local", "admin"),
    ]);

    render(<MemoryAdminPage />);
    await screen.findByText("user@fairy.local");

    fireEvent.click(screen.getByRole("button", { name: "新增记忆" }));
    await screen.findByRole("option", { name: "admin@fairy.local" });

    fireEvent.submit(
      screen.getByRole("heading", { name: "新增记忆" }).closest("form") as HTMLFormElement,
    );

    expect(await screen.findByText("请选择用户")).toBeDefined();
    expect(memoryApi.createMemory).not.toHaveBeenCalled();
  });

  it("edits kind and content of an existing memory", async () => {
    vi.mocked(memoryApi.fetchMemories).mockResolvedValue(
      feed([
        memoryItem({
          id: "mem-1",
          kind: "fact",
          content: "不吃香菜",
        }),
      ]),
    );

    render(<MemoryAdminPage />);
    await screen.findByText("不吃香菜");

    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]);

    expect((screen.getByLabelText("类型") as HTMLSelectElement).value).toBe("fact");
    fireEvent.change(screen.getByLabelText("内容"), {
      target: { value: "开始吃香菜了" },
    });
    fireEvent.submit(
      screen.getByRole("heading", { name: "编辑记忆" }).closest("form") as HTMLFormElement,
    );

    await waitFor(() =>
      expect(memoryApi.updateMemory).toHaveBeenCalledWith("mem-1", {
        kind: "fact",
        content: "开始吃香菜了",
      }),
    );
  });

  it("deletes a memory after confirmation and reloads", async () => {
    vi.mocked(memoryApi.fetchMemories).mockResolvedValue(feed([memoryItem({ id: "mem-9" })]));

    render(<MemoryAdminPage />);
    await screen.findByText("user@fairy.local");

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);
    expect(screen.getByText("确认删除")).toBeDefined();

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[1]);

    await waitFor(() => expect(memoryApi.deleteMemory).toHaveBeenCalledWith("mem-9"));
    expect(memoryApi.fetchMemories).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });
});

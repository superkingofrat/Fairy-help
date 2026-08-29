import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfilesAdminPage } from "../components/admin/ProfilesAdminPage";
import * as profileApi from "../lib/profileApi";
import type { ProfileListItem } from "@fairy/shared";

vi.mock("../lib/profileApi");

const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEV_ADMIN_ID = "00000000-0000-4000-8000-000000000002";

const sampleUsers: ProfileListItem[] = [
  {
    userId: DEV_USER_ID,
    email: "user@fairy.local",
    role: "user",
    profile: {
      userId: DEV_USER_ID,
      name: "铃",
      avatarUrl: null,
      styleTags: ["夜猫子"],
      likeGenres: ["科幻", "悬疑"],
      avoidFood: [],
      dietPreference: null,
      travelStyle: null,
      createdAt: "2024-01-15T10:20:00Z",
      updatedAt: "2024-08-05T18:45:00Z",
    },
  },
  {
    userId: DEV_ADMIN_ID,
    email: "admin@fairy.local",
    role: "admin",
    profile: null,
  },
];

describe("ProfilesAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profileApi.fetchProfiles).mockResolvedValue(sampleUsers);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders one row per user with profile state", async () => {
    render(<ProfilesAdminPage />);

    expect(await screen.findByText("user@fairy.local")).toBeDefined();
    expect(screen.getByText("admin@fairy.local")).toBeDefined();
    expect(screen.getByText("铃")).toBeDefined();
    expect(screen.getByText("无画像")).toBeDefined();
  });

  it("opens the edit modal prefilled for an existing profile", async () => {
    render(<ProfilesAdminPage />);

    const editButtons = await screen.findAllByRole("button", { name: "编辑画像" });
    fireEvent.click(editButtons[0]);

    expect(await screen.findByRole("heading", { name: "编辑画像" })).toBeDefined();
    const nameInput = screen.getByDisplayValue("铃") as HTMLInputElement;
    expect(nameInput.value).toBe("铃");
  });

  it("creates a profile for a user without one", async () => {
    vi.mocked(profileApi.createProfile).mockResolvedValue({
      userId: DEV_ADMIN_ID,
      name: "管理员",
      avatarUrl: null,
      styleTags: [],
      likeGenres: ["剧情"],
      avoidFood: [],
      dietPreference: null,
      travelStyle: null,
      createdAt: "2024-08-24T00:00:00Z",
      updatedAt: "2024-08-24T00:00:00Z",
    });

    render(<ProfilesAdminPage />);

    const createButton = await screen.findByRole("button", { name: "补建画像" });
    fireEvent.click(createButton);

    const nameInput = await screen.findByLabelText(/名字/);
    fireEvent.change(nameInput, { target: { value: "管理员" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("加载中...")).toBeDefined();
    expect(profileApi.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: DEV_ADMIN_ID, name: "管理员" })
    );
  });

  it("shows a field error when saving without a name", async () => {
    render(<ProfilesAdminPage />);

    const createButton = await screen.findByRole("button", { name: "补建画像" });
    fireEvent.click(createButton);

    await screen.findByLabelText(/名字/);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("请填写名字")).toBeDefined();
    expect(profileApi.createProfile).not.toHaveBeenCalled();
  });
});

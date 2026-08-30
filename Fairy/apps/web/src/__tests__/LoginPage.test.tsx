import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "../components/LoginPage";
import * as authApi from "../lib/authApi";
import { useAuthStore } from "../stores/authStore";

vi.mock("../lib/authApi");

afterEach(() => {
  cleanup();
  useAuthStore.setState({ token: null, user: null });
});

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits credentials and stores the session", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      token: "t",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "user@fairy.local", role: "user" },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "user@fairy.local" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "user123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await vi.waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith("user@fairy.local", "user123456");
    });
    expect(useAuthStore.getState().token).toBe("t");
    expect(useAuthStore.getState().user?.role).toBe("user");
  });

  it("shows the error message when login fails", async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error("邮箱或密码不正确"));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "user@fairy.local" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("邮箱或密码不正确")).toBeDefined();
  });
});

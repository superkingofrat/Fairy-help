import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RegisterPage } from "../components/RegisterPage";
import * as authApi from "../lib/authApi";
import { useAuthStore } from "../stores/authStore";

vi.mock("../lib/authApi");

const newUser = {
  id: "00000000-0000-4000-8000-000000000003",
  email: "new@fairy.local",
  role: "user",
};

afterEach(() => {
  cleanup();
  useAuthStore.setState({ token: null, refreshToken: null, user: null });
});

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fillForm(password = "secret123", confirm = password): void {
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "new@fairy.local" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: confirm } });
  }

  it("submits credentials and stores the session", async () => {
    vi.mocked(authApi.register).mockResolvedValue({ token: "t", refreshToken: "rt", user: newUser });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await vi.waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith("new@fairy.local", "secret123");
    });
    expect(useAuthStore.getState().token).toBe("t");
    expect(useAuthStore.getState().refreshToken).toBe("rt");
    expect(useAuthStore.getState().user?.email).toBe("new@fairy.local");
  });

  it("rejects mismatched passwords without calling the API", async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    fillForm("secret123", "secret124");
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByText("两次输入的密码不一致")).toBeDefined();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("rejects passwords shorter than 6 characters without calling the API", async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    fillForm("12345");
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByText("密码至少需要 6 个字符")).toBeDefined();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("shows the backend error message when registration fails", async () => {
    vi.mocked(authApi.register).mockRejectedValue(new Error("该邮箱已注册"));

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByText("该邮箱已注册")).toBeDefined();
  });
});

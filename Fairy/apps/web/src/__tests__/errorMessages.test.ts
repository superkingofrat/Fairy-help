import { describe, expect, it } from "vitest";
import { chatErrorMessage, localizedErrorMessage } from "../lib/errorMessages";
import { ApiRequestError } from "../lib/http";
import { t } from "../lib/i18n";

const translate = (key: Parameters<typeof t>[0]): string => t(key);

describe("chatErrorMessage", () => {
  it("maps backend contract codes to localized copy", () => {
    expect(
      chatErrorMessage(new ApiRequestError("会话不存在", "SESSION_NOT_FOUND"), translate),
    ).toBe(t("chat.error.SESSION_NOT_FOUND"));
    expect(chatErrorMessage(new ApiRequestError("无权访问", "SESSION_FORBIDDEN"), translate)).toBe(
      t("chat.error.SESSION_FORBIDDEN"),
    );
    expect(chatErrorMessage(new ApiRequestError("太频繁", "TOO_MANY_REQUESTS"), translate)).toBe(
      t("chat.error.TOO_MANY_REQUESTS"),
    );
    expect(chatErrorMessage(new ApiRequestError("参数不合法", "VALIDATION_ERROR"), translate)).toBe(
      t("chat.error.VALIDATION_ERROR"),
    );
  });

  it("maps chat link internal codes to localized copy", () => {
    expect(chatErrorMessage(new ApiRequestError("", "TIMEOUT"), translate)).toBe(
      t("chat.error.TIMEOUT"),
    );
    expect(chatErrorMessage(new ApiRequestError("", "STREAM"), translate)).toBe(
      t("chat.error.stream"),
    );
    expect(chatErrorMessage(new ApiRequestError("", "EMPTY_STREAM"), translate)).toBe(
      t("chat.error.EMPTY_STREAM"),
    );
    expect(chatErrorMessage(new ApiRequestError("", "SESSION_EXPIRED"), translate)).toBe(
      t("chat.error.SESSION_EXPIRED"),
    );
    expect(chatErrorMessage(new ApiRequestError("", "CHAT_FAILED"), translate)).toBe(
      t("chat.error"),
    );
  });

  it("keeps the backend message for codes without dedicated copy", () => {
    expect(
      chatErrorMessage(new ApiRequestError("模型暂时不可用", "LLM_UNAVAILABLE"), translate),
    ).toBe("模型暂时不可用");
  });

  it("falls back to chat.error when nothing carries a message", () => {
    expect(chatErrorMessage(new ApiRequestError("", "SOMETHING_ELSE"), translate)).toBe(
      t("chat.error"),
    );
    expect(chatErrorMessage(new Error(""), translate)).toBe(t("chat.error"));
    expect(chatErrorMessage("boom", translate)).toBe(t("chat.error"));
    expect(chatErrorMessage(undefined, translate)).toBe(t("chat.error"));
  });
});

describe("localizedErrorMessage", () => {
  it("maps transport layer codes to localized copy", () => {
    expect(
      localizedErrorMessage(
        new ApiRequestError("Failed to fetch", "NETWORK_ERROR"),
        translate,
        "library.error.load",
      ),
    ).toBe(t("error.network"));
    expect(
      localizedErrorMessage(
        new ApiRequestError("Invalid API response", "INVALID_RESPONSE"),
        translate,
        "library.error.load",
      ),
    ).toBe(t("error.invalidResponse"));
    expect(
      localizedErrorMessage(
        new ApiRequestError("Empty API response", "EMPTY_RESPONSE"),
        translate,
        "library.error.load",
      ),
    ).toBe(t("error.emptyResponse"));
    expect(
      localizedErrorMessage(
        new ApiRequestError("Request failed (500)", "REQUEST_FAILED"),
        translate,
        "library.error.load",
      ),
    ).toBe(t("error.requestFailed"));
    expect(
      localizedErrorMessage(
        new ApiRequestError("未登录", "UNAUTHORIZED"),
        translate,
        "library.error.load",
      ),
    ).toBe(t("error.unauthorized"));
  });

  it("keeps the backend message for other codes", () => {
    expect(
      localizedErrorMessage(
        new ApiRequestError("该邮箱已注册", "EMAIL_ALREADY_EXISTS"),
        translate,
        "login.error",
      ),
    ).toBe("该邮箱已注册");
  });

  it("falls back to the caller's key when there is no usable message", () => {
    expect(localizedErrorMessage(new ApiRequestError("", "WEIRD"), translate, "login.error")).toBe(
      t("login.error"),
    );
    expect(localizedErrorMessage(undefined, translate, "login.error")).toBe(t("login.error"));
  });
});

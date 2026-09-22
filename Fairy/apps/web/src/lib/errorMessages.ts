import { ApiRequestError } from "./http";
import type { Messages } from "./i18n";

type Translate = (key: keyof Messages) => string;

// 对话链路错误码 → 本地化文案。前四个是 API_CONTRACT §3.7 的契约码
// （SESSION_NOT_FOUND / SESSION_FORBIDDEN / TOO_MANY_REQUESTS / VALIDATION_ERROR），
// 其余是 chatApi 与 http 的链路内部码。未知码回退 error.message（后端 msg 已是中文）
const CHAT_ERROR_KEYS: Record<string, keyof Messages> = {
  SESSION_NOT_FOUND: "chat.error.SESSION_NOT_FOUND",
  SESSION_FORBIDDEN: "chat.error.SESSION_FORBIDDEN",
  TOO_MANY_REQUESTS: "chat.error.TOO_MANY_REQUESTS",
  VALIDATION_ERROR: "chat.error.VALIDATION_ERROR",
  CHAT_FAILED: "chat.error",
  TIMEOUT: "chat.error.TIMEOUT",
  STREAM: "chat.error.stream",
  EMPTY_STREAM: "chat.error.EMPTY_STREAM",
  SESSION_EXPIRED: "chat.error.SESSION_EXPIRED",
};

// 传输层合成码（http.ts）与 401 的通用文案：断网、非 JSON、空体、未分类失败
const COMMON_ERROR_KEYS: Record<string, keyof Messages> = {
  UNAUTHORIZED: "error.unauthorized",
  NETWORK_ERROR: "error.network",
  INVALID_RESPONSE: "error.invalidResponse",
  EMPTY_RESPONSE: "error.emptyResponse",
  REQUEST_FAILED: "error.requestFailed",
};

function errorCode(error: unknown): string | undefined {
  if (error instanceof ApiRequestError) {
    return error.code;
  }
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

function localizedKey(
  error: unknown,
  keys: Record<string, keyof Messages>,
): keyof Messages | undefined {
  const code = errorCode(error);
  return code ? keys[code] : undefined;
}

// 页面通用错误展示：已知码→本地化文案；未知码用 error.message（后端 msg 约定为中文）；
// 两者皆无时退回调用方兜底 key。任何分支都不把原始 JSON、英文提示或 i18n key 字面量抛到界面
export function localizedErrorMessage(
  error: unknown,
  translate: Translate,
  fallbackKey: keyof Messages,
): string {
  const key = localizedKey(error, COMMON_ERROR_KEYS);
  if (key) {
    return translate(key);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return translate(fallbackKey);
}

// 对话页专用：先按对话链路码映射，再走通用规则，兜底 chat.error
export function chatErrorMessage(error: unknown, translate: Translate): string {
  const key = localizedKey(error, CHAT_ERROR_KEYS);
  if (key) {
    return translate(key);
  }
  return localizedErrorMessage(error, translate, "chat.error");
}

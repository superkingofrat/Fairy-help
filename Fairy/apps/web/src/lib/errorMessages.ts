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

// FU-19 二期：行程 REST 契约码（API_CONTRACT  trips 段）。TRIP_NOT_FOUND 对不存在与他人所有
// 同文案，不泄漏行程存在性
const TRIP_ERROR_KEYS: Record<string, keyof Messages> = {
  TRIP_FORBIDDEN: "trips.error.TRIP_FORBIDDEN",
  TRIP_UNRESOLVED: "trips.error.TRIP_UNRESOLVED",
  TRIP_DRAFT_FAILED: "trips.error.TRIP_DRAFT_FAILED",
  TRIP_NOT_FOUND: "trips.error.TRIP_NOT_FOUND",
};

// 传输层合成码（http.ts）与 401 的通用文案：断网、非 JSON、空体、未分类失败
const COMMON_ERROR_KEYS: Record<string, keyof Messages> = {
  UNAUTHORIZED: "error.unauthorized",
  NETWORK_ERROR: "error.network",
  INVALID_RESPONSE: "error.invalidResponse",
  EMPTY_RESPONSE: "error.emptyResponse",
  REQUEST_FAILED: "error.requestFailed",
};

// 2026-09-23-proactive-ops-suggestions：运营建议契约码（API_CONTRACT suggestions 段）
const SUGGESTION_ERROR_KEYS: Record<string, keyof Messages> = {
  SUGGESTION_NOT_FOUND: "suggestions.error.SUGGESTION_NOT_FOUND",
  FORBIDDEN: "suggestions.error.FORBIDDEN",
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

// 行程页专用：先按 trips 契约码映射，再走通用规则，兜底 trips.error.default
export function tripErrorMessage(error: unknown, translate: Translate): string {
  const key = localizedKey(error, TRIP_ERROR_KEYS);
  if (key) {
    return translate(key);
  }
  return localizedErrorMessage(error, translate, "trips.error.default");
}

// 运营建议专用：先按 suggestions 契约码映射，再走通用规则，兜底 suggestions.error.default
export function suggestionErrorMessage(error: unknown, translate: Translate): string {
  const key = localizedKey(error, SUGGESTION_ERROR_KEYS);
  if (key) {
    return translate(key);
  }
  return localizedErrorMessage(error, translate, "suggestions.error.default");
}

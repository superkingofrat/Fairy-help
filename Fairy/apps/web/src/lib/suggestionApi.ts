import { request } from "./http";
import type { Suggestion, SuggestionListFeed, UnreadCount } from "@fairy/shared";

// 2026-09-23-proactive-ops-suggestions：运营建议面的 web 客户端（admin-only，
// 后端对四端点全部 requireRole("admin")，403 由接口兜底，前端不重复做角色判定）。
// 401 单飞刷新与错误码归一化继承 lib/http。
export async function listSuggestions(
  params: {
    page?: number;
    limit?: number;
  } = {},
): Promise<SuggestionListFeed> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  return request<SuggestionListFeed>(`/api/suggestions?${query.toString()}`);
}

export async function getUnreadCount(): Promise<UnreadCount> {
  return request<UnreadCount>("/api/suggestions/unread-count");
}

export async function markSuggestionRead(suggestionId: string): Promise<Suggestion> {
  return request<Suggestion>(`/api/suggestions/${suggestionId}/read`, { method: "PATCH" });
}

// 手动生成当日日报：与调度器同一入口，当日已有产物时返回既有那条（不重复生成）
export async function generateDailySuggestion(): Promise<Suggestion> {
  return request<Suggestion>("/api/suggestions/generate-daily", { method: "POST" });
}

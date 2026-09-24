import { useCallback, useEffect, useState } from "react";
import type { Suggestion, SuggestionKind, SuggestionListFeed } from "@fairy/shared";
import {
  generateDailySuggestion,
  getUnreadCount,
  listSuggestions,
  markSuggestionRead,
} from "../../lib/suggestionApi";
import { suggestionErrorMessage } from "../../lib/errorMessages";
import { t, type Messages } from "../../lib/i18n";

// 2026-09-23-proactive-ops-suggestions：管理端运营建议流（运营洞察页内联）。
// 未读以 /unread-count 为准（跨页总量）；标记已读即时更新本地态并递减，
// 「全部已读」对当页未读串行 PATCH，任一条失败即中断并提示（避免并发写同一行）。
const KIND_LABEL_KEYS: Record<SuggestionKind, keyof Messages> = {
  LOW_STOCK: "suggestions.kind.LOW_STOCK",
  BORROW_RATIO: "suggestions.kind.BORROW_RATIO",
  DORMANT: "suggestions.kind.DORMANT",
  DAILY_REPORT: "suggestions.kind.DAILY_REPORT",
};

function formatCreatedAt(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString("zh-CN", { hour12: false });
}

function SuggestionItem({
  suggestion,
  onMarkRead,
}: {
  suggestion: Suggestion;
  onMarkRead: (suggestion: Suggestion) => void;
}): JSX.Element {
  const unread = suggestion.readAt === null;
  return (
    <li
      className={`rounded-lg border p-4 ${
        unread ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {t(KIND_LABEL_KEYS[suggestion.kind])}
        </span>
        <span className="text-sm font-semibold text-slate-800">{suggestion.summary}</span>
        <span className="ml-auto text-xs text-slate-400">
          {formatCreatedAt(suggestion.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-line text-sm text-slate-700">{suggestion.body}</p>
      {unread ? (
        <button
          type="button"
          onClick={() => onMarkRead(suggestion)}
          className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          {t("suggestions.markRead")}
        </button>
      ) : null}
    </li>
  );
}

export function SuggestionFeed(): JSX.Element {
  const [feed, setFeed] = useState<SuggestionListFeed | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedData, unread] = await Promise.all([listSuggestions(), getUnreadCount()]);
      setFeed(feedData);
      setUnreadCount(unread.count);
    } catch (loadError) {
      setError(suggestionErrorMessage(loadError, t));
      setFeed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkRead = useCallback(async (suggestion: Suggestion) => {
    try {
      await markSuggestionRead(suggestion.id);
      setFeed((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === suggestion.id ? { ...item, readAt: new Date().toISOString() } : item,
              ),
            }
          : current,
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (markError) {
      setError(suggestionErrorMessage(markError, t));
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    if (!feed) {
      return;
    }
    const unreadItems = feed.items.filter((item) => item.readAt === null);
    for (const item of unreadItems) {
      await handleMarkRead(item);
    }
  }, [feed, handleMarkRead]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      // 当日已有日报时服务层直接返回既有产物（幂等），这里统一重新拉取建议流
      await generateDailySuggestion();
      await load();
    } catch (generateError) {
      setError(suggestionErrorMessage(generateError, t));
    } finally {
      setGenerating(false);
    }
  }, [load]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-slate-800">{t("suggestions.title")}</h2>
        {unreadCount > 0 ? (
          <span
            data-testid="suggestion-unread-badge"
            className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
          >
            {t("suggestions.unreadBadge").replace("{n}", String(unreadCount))}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {feed && feed.items.some((item) => item.readAt === null) ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              {t("suggestions.markAllRead")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={generating}
            onClick={() => void handleGenerate()}
            className="rounded border border-indigo-300 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? t("suggestions.generating") : t("suggestions.generate")}
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-600">{t("suggestions.loading")}</p>
      ) : error || !feed ? null : feed.items.length === 0 ? (
        <p className="text-sm text-slate-500">{t("suggestions.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {feed.items.map((item) => (
            <SuggestionItem key={item.id} suggestion={item} onMarkRead={handleMarkRead} />
          ))}
        </ul>
      )}
    </div>
  );
}

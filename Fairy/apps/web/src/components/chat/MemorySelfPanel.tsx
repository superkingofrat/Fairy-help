import { useEffect, useState } from "react";
import type { MemoryKind, MemorySelfListFeed, MemorySelfListItem } from "@fairy/shared";
import { listMyMemories } from "../../lib/memoryApi";
import { t, type Messages } from "../../lib/i18n";

// FU-17：会话页「Fairy 记住了什么」自查面板——本人记忆只读列表（时间倒序、分页）。
// 来源标注按 sessionId 有无推断：对话抽取（关联会话） vs 系统录入（管理/种子，无会话）。
// 面板只读：不提供新增/编辑/删除。

const PAGE_SIZE = 20;

const KIND_LABEL_KEY: Record<MemoryKind, keyof Messages> = {
  preference: "memory.kind.preference",
  fact: "memory.kind.fact",
  intent: "memory.kind.intent",
};

function originLabel(item: MemorySelfListItem): string {
  return item.sessionId ? t("memory.self.source.conversation") : t("memory.self.source.system");
}

function formatMemoryTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function MemorySelfPanel(): JSX.Element {
  const [feed, setFeed] = useState<MemorySelfListFeed | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMyMemories({ page, limit: PAGE_SIZE })
      .then((data) => {
        if (!cancelled) {
          setFeed(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("memory.self.error.load"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  const totalPages = feed?.pagination.totalPages ?? 1;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-slate-700">{t("memory.self.title")}</h3>

      {loading ? <p className="mt-2 text-sm text-slate-500">{t("memory.self.loading")}</p> : null}

      {!loading && error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && feed && feed.items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{t("memory.self.empty")}</p>
      ) : null}

      {!loading && !error && feed && feed.items.length > 0 ? (
        <>
          <ul className="mt-2 flex flex-col gap-2">
            {feed.items.map((item) => (
              <li key={item.id} className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                    {t(KIND_LABEL_KEY[item.kind])}
                  </span>
                  <span className="text-xs text-slate-400">{originLabel(item)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{item.content}</p>
                <p className="mt-1 text-xs text-slate-400">{formatMemoryTime(item.createdAt)}</p>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              >
                {t("memory.page.prev")}
              </button>
              <span>
                {t("memory.page.info")
                  .replace("{page}", String(page))
                  .replace("{totalPages}", String(totalPages))}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              >
                {t("memory.page.next")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

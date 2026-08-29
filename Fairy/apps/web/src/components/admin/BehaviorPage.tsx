import { useCallback, useEffect, useState } from "react";
import { BEHAVIOR_ACTIONS, type BehaviorLogListItem } from "@fairy/shared";
import { fetchBehaviorLogs } from "../../lib/behaviorApi";
import { t } from "../../lib/i18n";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function movieCell(log: BehaviorLogListItem): string {
  if (log.movieTitle) {
    return `《${log.movieTitle}》`;
  }
  if (log.action === "RECOMMEND" && log.recommendCount !== null) {
    return t("behavior.recommended").replace("{count}", String(log.recommendCount));
  }
  return "-";
}

export function BehaviorPage(): JSX.Element {
  const [logs, setLogs] = useState<BehaviorLogListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async (currentPage: number, action: string) => {
    setLoading(true);
    setError(null);

    try {
      const feed = await fetchBehaviorLogs({
        page: currentPage,
        limit: 20,
        ...(action ? { action: action as never } : {}),
      });
      setLogs(feed.items);
      setTotalPages(feed.pagination.totalPages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("behavior.error.load"));
      setLogs([]);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs(page, actionFilter);
  }, [actionFilter, loadLogs, page]);

  function changeFilter(action: string): void {
    setActionFilter(action);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{t("behavior.title")}</h1>
        <p className="text-slate-600">{t("behavior.subtitle")}</p>
      </div>

      <div className="mb-4 flex gap-3">
        <select
          value={actionFilter}
          onChange={(event) => changeFilter(event.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          <option value="">{t("behavior.filter.all")}</option>
          {BEHAVIOR_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {t(`behavior.action.${action}` as never)}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-slate-600">{t("behavior.loading")}</p>
      ) : error ? null : logs.length === 0 ? (
        <p className="text-slate-600">{t("behavior.empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">{t("behavior.table.time")}</th>
                <th className="px-4 py-3">{t("behavior.table.email")}</th>
                <th className="px-4 py-3">{t("behavior.table.action")}</th>
                <th className="px-4 py-3">{t("behavior.table.movie")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs">{formatTime(log.createdAt)}</td>
                  <td className="px-4 py-3">{log.email}</td>
                  <td className="px-4 py-3">{t(`behavior.action.${log.action}` as never)}</td>
                  <td className="px-4 py-3">{movieCell(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded border border-slate-300 px-3 py-2 disabled:opacity-40"
          >
            {t("behavior.page.prev")}
          </button>
          <span className="text-slate-600">
            {t("behavior.page.info")
              .replace("{page}", String(page))
              .replace("{totalPages}", String(totalPages))}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="rounded border border-slate-300 px-3 py-2 disabled:opacity-40"
          >
            {t("behavior.page.next")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

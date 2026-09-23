import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { MoodSceneCount, StoreInsightsOverview } from "@fairy/shared";
import { fetchInsightsOverview } from "../../lib/insightApi";
import { localizedErrorMessage } from "../../lib/errorMessages";
import { t } from "../../lib/i18n";
import { SuggestionFeed } from "./SuggestionFeed";

function barWidth(count: number, max: number): number {
  return max > 0 ? Math.round((count / max) * 100) : 0;
}

function Card({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function DistributionList({ items }: { items: MoodSceneCount[] }): JSX.Element {
  const max = Math.max(...items.map((item) => item.count), 0);
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{t("insights.distribution.empty")}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.value} className="flex items-center gap-2 text-sm">
          <span className="w-16 truncate text-slate-700">{item.value}</span>
          <div className="h-4 flex-1 rounded bg-slate-100">
            <div
              className="h-4 rounded bg-indigo-500"
              style={{ width: `${barWidth(item.count, max)}%` }}
            />
          </div>
          <span className="w-8 text-right text-slate-600">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export function InsightsAdminPage(): JSX.Element {
  const [overview, setOverview] = useState<StoreInsightsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInsightsOverview();
      setOverview(data);
    } catch (loadError) {
      setError(localizedErrorMessage(loadError, t, "insights.error.load"));
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmpty =
    overview !== null &&
    overview.popularMovies.length === 0 &&
    overview.moods.length === 0 &&
    overview.scenes.length === 0 &&
    overview.inventory.lowStockMovies.length === 0 &&
    overview.activity.totalUsers === 0;

  const trendMax = overview
    ? Math.max(...overview.trend.map((point) => Math.max(point.borrowCount, point.returnCount)), 0)
    : 0;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("insights.title")}</h1>
          <p className="text-slate-600">{t("insights.subtitle")}</p>
        </div>
        {!loading && !error ? (
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            {t("insights.refresh")}
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {/* 主动运营建议流（2026-09-23-proactive-ops-suggestions）：
          自包含卡片，无论看板是否有数据都渲染，自身三态不影响既有看板 */}
      <div className="mb-6">
        <SuggestionFeed />
      </div>

      {loading ? (
        <p className="text-slate-600">{t("insights.loading")}</p>
      ) : error || overview === null ? null : isEmpty ? (
        <p className="text-slate-600">{t("insights.empty")}</p>
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard
              label={t("insights.inventory.activeRentals")}
              value={overview.inventory.activeRentals}
            />
            <StatCard
              label={t("insights.inventory.borrowedRatio")}
              value={`${Math.round(overview.inventory.borrowedRatio * 100)}%`}
            />
            <StatCard
              label={t("insights.activity.totalUsers")}
              value={overview.activity.totalUsers}
            />
            <StatCard
              label={t("insights.activity.activeUsers7d")}
              value={overview.activity.activeUsers7d}
            />
            <StatCard
              label={t("insights.activity.newUsers7d")}
              value={overview.activity.newUsers7d}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title={t("insights.section.popular")}>
              {overview.popularMovies.length === 0 ? (
                <p className="text-sm text-slate-500">{t("insights.empty")}</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-2 pr-2 font-medium">{t("insights.table.rank")}</th>
                      <th className="pb-2 pr-2 font-medium">{t("insights.table.title")}</th>
                      <th className="pb-2 pr-2 text-right font-medium">
                        {t("insights.table.borrowCount")}
                      </th>
                      <th className="pb-2 pr-2 text-right font-medium">
                        {t("insights.table.recommendCount")}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t("insights.table.availability")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.popularMovies.map((movie, index) => (
                      <tr key={movie.movieId} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-slate-500">{index + 1}</td>
                        <td className="py-2 pr-2 text-slate-800">《{movie.title}》</td>
                        <td className="py-2 pr-2 text-right text-slate-700">{movie.borrowCount}</td>
                        <td className="py-2 pr-2 text-right text-slate-700">
                          {movie.recommendCount}
                        </td>
                        <td className="py-2 text-right">
                          {movie.inStock ? (
                            <span className="text-emerald-600">{t("insights.available")}</span>
                          ) : (
                            <span className="text-red-600">{t("insights.outOfStock")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title={t("insights.section.inventory")}>
              {overview.inventory.lowStockMovies.length === 0 ? (
                <p className="text-sm text-slate-500">{t("insights.inventory.lowStockEmpty")}</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-2 pr-2 font-medium">{t("insights.table.title")}</th>
                      <th className="pb-2 pr-2 text-right font-medium">
                        {t("insights.inventory.stock")}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t("insights.inventory.totalStock")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.inventory.lowStockMovies.map((movie) => (
                      <tr key={movie.movieId} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-slate-800">《{movie.title}》</td>
                        <td className="py-2 pr-2 text-right text-red-600">{movie.stock}</td>
                        <td className="py-2 text-right text-slate-700">{movie.totalStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title={t("insights.section.trend")}>
            <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-indigo-500" />
                {t("insights.trend.borrow")}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-emerald-500" />
                {t("insights.trend.return")}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {overview.trend.map((point) => (
                <div key={point.date} className="flex items-center gap-3 text-xs">
                  <span className="w-14 text-slate-500">{point.date.slice(5)}</span>
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex h-3 flex-1 items-center rounded bg-slate-100">
                      <div
                        className="h-3 rounded bg-indigo-500"
                        style={{ width: `${barWidth(point.borrowCount, trendMax)}%` }}
                      />
                    </div>
                    <div className="flex h-3 flex-1 items-center rounded bg-slate-100">
                      <div
                        className="h-3 rounded bg-emerald-500"
                        style={{ width: `${barWidth(point.returnCount, trendMax)}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-10 text-right text-slate-600">
                    {point.borrowCount}/{point.returnCount}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title={t("insights.section.moodDistribution")}>
              <DistributionList items={overview.moods} />
            </Card>
            <Card title={t("insights.section.sceneDistribution")}>
              <DistributionList items={overview.scenes} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

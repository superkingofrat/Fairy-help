import { FormEvent, useEffect, useState } from "react";
import type { TripDetail, TripListFeed, TripListItem } from "@fairy/shared";
import { tripErrorMessage } from "../../lib/errorMessages";
import { t } from "../../lib/i18n";
import { createTrip, getTrip, listTrips } from "../../lib/tripApi";
import { useAuthStore } from "../../stores/authStore";
import { TripTimeline } from "../chat/TripTimeline";

// FU-19（旅行规划二期）：历史行程面。列表（分页 + 加载/错误/空态）+ 选中详情
// （复用对话页 TripTimeline，地图叠加层随之一致）。创建表单仅 admin/agent 可见——
// 普通用户只读列表，前端不发无效请求；403 由后端兜底。
const PAGE_SIZE = 20;

const DAYS_MAX = 14;

function formatTripTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function parseDays(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }
  const days = Number(trimmed);
  return Number.isInteger(days) && days >= 1 && days <= DAYS_MAX ? days : undefined;
}

export function TripsPage(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const canCreate = user?.role === "admin" || user?.role === "agent";

  const [feed, setFeed] = useState<TripListFeed | null>(null);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [destination, setDestination] = useState("");
  const [days, setDays] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);
    listTrips({ page, limit: PAGE_SIZE })
      .then((data) => {
        if (!cancelled) {
          setFeed(data);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setListError(tripErrorMessage(error, t));
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
  }, [page, reloadToken]);

  async function openTrip(trip: TripListItem): Promise<void> {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      setDetail(await getTrip(trip.id));
    } catch (error) {
      setDetailError(tripErrorMessage(error, t));
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmedDestination = destination.trim();
    if (!trimmedDestination || creating) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreateNotice(null);
    const parsedDays = parseDays(days);
    try {
      await createTrip({
        destination: trimmedDestination,
        ...(parsedDays ? { days: parsedDays } : {}),
      });
      setDestination("");
      setDays("");
      setPage(1);
      setReloadToken((token) => token + 1);
      setCreateNotice(t("trips.create.success"));
    } catch (error) {
      setCreateError(tripErrorMessage(error, t));
    } finally {
      setCreating(false);
    }
  }

  const totalPages = feed?.pagination.totalPages ?? 1;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{t("trips.title")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("trips.subtitle")}</p>
      </div>

      {canCreate ? (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="rounded-lg border border-slate-200 bg-white p-3"
        >
          <h3 className="text-sm font-semibold text-slate-700">{t("trips.create.title")}</h3>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("trips.create.destination")}
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                maxLength={100}
                placeholder={t("trips.create.destinationPlaceholder")}
                className="w-48 rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("trips.create.days")}
              <input
                type="number"
                min={1}
                max={DAYS_MAX}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                placeholder={t("trips.create.daysPlaceholder")}
                className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
            <button
              type="submit"
              disabled={creating || destination.trim() === ""}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:bg-slate-300"
            >
              {creating ? t("trips.create.creating") : t("trips.create.submit")}
            </button>
          </div>
          {createError ? <p className="mt-2 text-sm text-red-600">{createError}</p> : null}
          {createNotice ? <p className="mt-2 text-sm text-emerald-600">{createNotice}</p> : null}
        </form>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
          {t("trips.create.readonlyHint")}
        </p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-700">{t("trips.list.title")}</h3>

        {loading ? <p className="mt-2 text-sm text-slate-500">{t("trips.list.loading")}</p> : null}

        {!loading && listError ? <p className="mt-2 text-sm text-red-600">{listError}</p> : null}

        {!loading && !listError && feed && feed.items.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{t("trips.list.empty")}</p>
        ) : null}

        {!loading && !listError && feed && feed.items.length > 0 ? (
          <>
            <ul className="mt-2 flex flex-col gap-2">
              {feed.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openTrip(item)}
                    className="w-full rounded border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{item.destination}</span>
                      <span className="text-xs text-slate-400">
                        {t("chat.trip.days").replace("{n}", String(item.days))}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          item.validated
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.validated ? t("chat.trip.validated") : t("chat.trip.unvalidated")}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {formatTripTime(item.createdAt)}
                    </span>
                  </button>
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
                  {t("trips.page.prev")}
                </button>
                <span>
                  {t("trips.page.info")
                    .replace("{page}", String(page))
                    .replace("{totalPages}", String(totalPages))}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                >
                  {t("trips.page.next")}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-700">{t("trips.detail.title")}</h3>
        {detailLoading ? (
          <p className="mt-2 text-sm text-slate-500">{t("trips.detail.loading")}</p>
        ) : null}
        {!detailLoading && detailError ? (
          <p className="mt-2 text-sm text-red-600">{detailError}</p>
        ) : null}
        {!detailLoading && !detailError && detail ? <TripTimeline trip={detail} /> : null}
        {!detailLoading && !detailError && !detail ? (
          <p className="mt-2 text-sm text-slate-400">{t("trips.detail.empty")}</p>
        ) : null}
      </section>
    </div>
  );
}

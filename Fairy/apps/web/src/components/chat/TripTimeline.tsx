import type { TripResult } from "@fairy/shared";
import { t } from "../../lib/i18n";

interface TripTimelineProps {
  trip: TripResult;
}

// FU-13：行程卡片——按天渲染 POI 时间轴 + 驾车路线摘要；validated=false 的 POI 标注未核实。
export function TripTimeline({ trip }: TripTimelineProps): JSX.Element {
  const route = trip.route ?? [];
  const totalKm = route.reduce((sum, leg) => sum + (leg.distanceMeters ?? 0), 0) / 1000;
  const totalMinutes = Math.round(
    route.reduce((sum, leg) => sum + (leg.durationSeconds ?? 0), 0) / 60,
  );

  return (
    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-sky-900">
          {t("chat.trip.title")} · {trip.destination}
        </h4>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            trip.validated ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {trip.validated ? t("chat.trip.validated") : t("chat.trip.unvalidated")}
        </span>
      </div>
      <p className="mt-1 text-xs text-sky-700">
        {t("chat.trip.days").replace("{n}", String(trip.days))}
      </p>
      <ol className="mt-3 flex flex-col gap-3">
        {trip.itinerary.map((day) => (
          <li key={day.day}>
            <h5 className="text-xs font-semibold text-sky-800">
              {t("chat.trip.day").replace("{n}", String(day.day))}
              {day.title ? ` · ${day.title}` : ""}
            </h5>
            <ol className="mt-1 flex flex-col gap-1 border-l-2 border-sky-200 pl-3">
              {day.steps.map((step, index) => (
                <li
                  key={`${day.day}-${index}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-sm"
                >
                  <span className="w-12 shrink-0 font-mono text-xs text-slate-400">
                    {step.time}
                  </span>
                  <span className="font-medium text-slate-800">{step.name}</span>
                  <span className="text-xs text-slate-400">{step.category}</span>
                  {!step.validated ? (
                    <span className="text-xs text-amber-600">{t("chat.trip.stepUnverified")}</span>
                  ) : null}
                  {step.note ? <span className="text-xs text-slate-500">— {step.note}</span> : null}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      {route.length > 0 ? (
        <p className="mt-3 text-xs text-sky-700">
          {t("chat.trip.route")}：
          {t("chat.trip.routeSummary")
            .replace("{km}", totalKm.toFixed(1))
            .replace("{min}", String(totalMinutes))}
        </p>
      ) : null}
    </div>
  );
}

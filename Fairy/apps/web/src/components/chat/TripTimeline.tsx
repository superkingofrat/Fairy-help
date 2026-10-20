import type { TripResult } from "@fairy/shared";
import { t } from "../../lib/i18n";
import { TripMap } from "./TripMap";

interface TripTimelineProps {
  trip: TripResult;
}

// FU-13：行程卡片——按天渲染 POI 时间轴 + 驾车路线摘要；validated=false 的 POI 标注未核实。
// FU-19 二期：卡片底部挂地图叠加层（TripMap 自行判断 key/坐标/加载失败的静默降级）。
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
        {/* FU-20：同行人是行程事实的一部分（快照），与天数同行展示；无同行人时整节点不渲染，
            回放存量行程（companion 为 null）与改动前逐字一致 */}
        {trip.companion
          ? ` · ${t("chat.trip.companion").replace("{name}", trip.companion.name)}`
          : ""}
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
                  {/* FU-21：偏好依据——该选点落实了哪条画像偏好、因此选/避开了什么。
                      个性化从「看不见」变「看得见」的落点。为 null 时整节点不渲染，
                      回放存量行程（缺键解析为 null）与改动前逐字一致，不出现空壳占位。
                      文案只取依据原文、不拼同行人名：依据本身已写成「哪条偏好 → 因此选/避开了
                      什么」；且依据也可能来自本人旅行风格（无同行人可归），套人名会出现两套模板。 */}
                  {step.preferenceBasis ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                      {t("chat.trip.preferenceBasis").replace("{basis}", step.preferenceBasis)}
                    </span>
                  ) : null}
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
      <TripMap trip={trip} />
    </div>
  );
}

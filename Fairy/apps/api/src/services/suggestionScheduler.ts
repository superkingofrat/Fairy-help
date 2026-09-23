import {
  DAILY_HOUR,
  DETECTION_INTERVAL_MINUTES,
  generateDailyReport,
  runThresholdCycle,
} from "./suggestionService";
import { toLocalDateKey } from "./insightService";

// 2026-09-23-proactive-ops-suggestions：进程内调度器（无外部 cron/queue 依赖）。
// 阈值周期 + 本地 08:00 日报；判定函数保持纯函数便于单测，
// 日报「今日是否已生成」一律以数据库 dedupeKey 唯一索引为准（多实例也安全），
// 内存只记录「本进程今天是否已尝试过」，避免每次 tick 都打库。

export function shouldRunThresholdCycle(
  now: Date,
  lastCycleAt: Date | null,
  cycleMinutes: number = DETECTION_INTERVAL_MINUTES,
): boolean {
  if (!lastCycleAt) {
    return true;
  }
  return now.getTime() - lastCycleAt.getTime() >= cycleMinutes * 60_000;
}

/** 本地时间已过当日报导时点（08:00）且本进程今天尚未跑过。 */
export function shouldRunDaily(now: Date, lastDailyDateKey: string | null): boolean {
  if (now.getHours() < DAILY_HOUR) {
    return false;
  }
  return lastDailyDateKey !== toLocalDateKey(now);
}

export interface StartSchedulerOptions {
  /** 阈值检测周期（分钟），缺省 15。 */
  cycleMinutes?: number;
  /** 调度 tick 粒度（分钟），缺省 1 —— 日报需要分钟级精度，阈值按周期自行收敛。 */
  tickMinutes?: number;
}

export interface SchedulerHandle {
  stop(): void;
}

function logSchedulerEvent(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ source: "suggestionScheduler", ...event }));
}

export function startScheduler(options: StartSchedulerOptions = {}): SchedulerHandle {
  const cycleMinutes = options.cycleMinutes ?? DETECTION_INTERVAL_MINUTES;
  const tickMinutes = Math.max(1, options.tickMinutes ?? 1);

  if (!process.env.TZ) {
    // 本地日分桶（洞察窗口与日报同日界）依赖服务器时区，缺省时按容器本地时区走，
    // 部署文档要求显式 TZ=Asia/Shanghai；启动 warn 一次，不阻断服务。
    console.warn(JSON.stringify({ source: "suggestionScheduler", code: "TZ_NOT_SET" }));
  }

  let lastCycleAt: Date | null = null;
  let lastDailyDateKey: string | null = null;

  const tick = async (now: Date): Promise<void> => {
    if (shouldRunThresholdCycle(now, lastCycleAt, cycleMinutes)) {
      // 先记账再执行：执行失败（如数据库不可达）时下个周期才重试，避免每 tick 重击
      lastCycleAt = now;
      try {
        const result = await runThresholdCycle(now);
        logSchedulerEvent({ event: "threshold_cycle", ...result });
      } catch {
        console.warn(JSON.stringify({ source: "suggestionScheduler", code: "CYCLE_FAILED" }));
      }
    }
    if (shouldRunDaily(now, lastDailyDateKey)) {
      lastDailyDateKey = toLocalDateKey(now);
      try {
        // 幂等：当日已有产物（含多实例抢先）时直接读回，不重复生成
        await generateDailyReport(now);
        logSchedulerEvent({ event: "daily_report", dateKey: lastDailyDateKey });
      } catch {
        // 失败不更新 lastDailyDateKey 之外的任何状态；下个 tick 会因唯一索引自动幂等
        console.warn(JSON.stringify({ source: "suggestionScheduler", code: "DAILY_FAILED" }));
      }
    }
  };

  // 启动即跑一次：冷启动后不依赖等到整周期（真机验收 AC-1 依赖该行为）
  void tick(new Date());
  const timer = setInterval(() => {
    void tick(new Date());
  }, tickMinutes * 60_000);
  // 不让调度器单独撑住事件循环：http server 才是进程生命周期的主宰
  timer.unref?.();

  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}

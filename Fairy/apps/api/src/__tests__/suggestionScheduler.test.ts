import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  shouldRunDaily,
  shouldRunThresholdCycle,
  startScheduler,
} from "../services/suggestionScheduler.js";
import { generateDailyReport, runThresholdCycle } from "../services/suggestionService.js";

vi.mock("../services/suggestionService.js", () => ({
  DAILY_HOUR: 8,
  DETECTION_INTERVAL_MINUTES: 15,
  runThresholdCycle: vi.fn(),
  generateDailyReport: vi.fn(),
}));

vi.mock("../services/insightService.js", () => ({
  toLocalDateKey: (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
}));

const NOON = new Date(2026, 8, 23, 12, 0, 0);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runThresholdCycle).mockResolvedValue({ created: 0, skipped: 0, closed: 0 });
  vi.mocked(generateDailyReport).mockResolvedValue({
    id: "s1",
    kind: "DAILY_REPORT",
    summary: "经营日报",
    body: "今日经营速览",
    sourceData: {},
    readAt: null,
    createdAt: "2026-09-23T04:00:00.000Z",
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shouldRunThresholdCycle", () => {
  it("runs immediately when no cycle has run yet", () => {
    expect(shouldRunThresholdCycle(NOON, null)).toBe(true);
  });

  it("waits for the full cycle interval", () => {
    const last = new Date(NOON.getTime() - 14 * 60_000);
    expect(shouldRunThresholdCycle(NOON, last)).toBe(false);

    const due = new Date(NOON.getTime() - 15 * 60_000);
    expect(shouldRunThresholdCycle(NOON, due)).toBe(true);
  });

  it("honors a custom cycle interval", () => {
    const fourMinutesAgo = new Date(NOON.getTime() - 4 * 60_000);
    expect(shouldRunThresholdCycle(NOON, fourMinutesAgo, 5)).toBe(false);
    expect(shouldRunThresholdCycle(NOON, fourMinutesAgo, 2)).toBe(true);

    const fiveMinutesAgo = new Date(NOON.getTime() - 5 * 60_000);
    expect(shouldRunThresholdCycle(NOON, fiveMinutesAgo, 5)).toBe(true);
    expect(shouldRunThresholdCycle(NOON, fiveMinutesAgo, 10)).toBe(false);
  });
});

describe("shouldRunDaily", () => {
  it("does not run before 08:00 local", () => {
    const early = new Date(2026, 8, 23, 7, 59, 0);
    expect(shouldRunDaily(early, null)).toBe(false);
  });

  it("runs once per local day after 08:00", () => {
    const morning = new Date(2026, 8, 23, 8, 0, 0);
    expect(shouldRunDaily(morning, null)).toBe(true);
    expect(shouldRunDaily(morning, "2026-09-23")).toBe(false);
    expect(shouldRunDaily(morning, "2026-09-22")).toBe(true);

    const nextDay = new Date(2026, 8, 24, 8, 1, 0);
    expect(shouldRunDaily(nextDay, "2026-09-23")).toBe(true);
  });
});

describe("startScheduler", () => {
  it("runs a threshold cycle immediately on startup", async () => {
    const handle = startScheduler({ tickMinutes: 1 });
    await vi.advanceTimersByTimeAsync(0);

    expect(runThresholdCycle).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("keeps the threshold cycle on its own interval while ticking every minute", async () => {
    const handle = startScheduler({ tickMinutes: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(runThresholdCycle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(14 * 60_000);
    expect(runThresholdCycle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runThresholdCycle).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it("does not generate the daily report before 08:00 and runs it once the hour passes", async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 7, 30, 0));
    const handle = startScheduler({ tickMinutes: 1 });
    await vi.advanceTimersByTimeAsync(29 * 60_000);

    expect(generateDailyReport).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000); // 08:30
    expect(generateDailyReport).toHaveBeenCalledTimes(1);

    // 同一天后续 tick 不重复触发（当日幂等由服务层唯一索引兜底）
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(generateDailyReport).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("stops all cycles once the handle is stopped", async () => {
    // 停在 08:00 之前，隔离日报触发，只断言阈值周期
    vi.setSystemTime(new Date(2026, 8, 23, 7, 0, 0));
    const handle = startScheduler({ tickMinutes: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(runThresholdCycle).toHaveBeenCalledTimes(1);

    handle.stop();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(runThresholdCycle).toHaveBeenCalledTimes(1);
    expect(generateDailyReport).not.toHaveBeenCalled();
  });

  it("keeps ticking after a cycle failure", async () => {
    vi.mocked(runThresholdCycle).mockRejectedValue(new Error("db down"));
    const handle = startScheduler({ tickMinutes: 1 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15 * 60_000);

    expect(runThresholdCycle).toHaveBeenCalledTimes(2);
    handle.stop();
  });
});

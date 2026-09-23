import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@fairy/database";
import type { DailyBorrowPoint, StoreInsightsOverview } from "@fairy/shared";
import {
  detectThresholdAnomalies,
  generateDailyReport,
  generateSuggestion,
  getUnreadCount,
  listSuggestions,
  markRead,
  runThresholdCycle,
} from "../services/suggestionService";
import { getStoreInsightsOverview } from "../services/insightService";
import { tryChat } from "../agent/llmClient";

vi.mock("../agent/llmClient", () => ({
  sanitizeUserInput: (message: string) => message,
  tryChat: vi.fn(),
}));

// insightService 仅 mock 打库的聚合函数；toLocalDateKey 保留真实公式（与实现共用保证确定性）
vi.mock("../services/insightService", () => ({
  getStoreInsightsOverview: vi.fn(),
  toLocalDateKey: (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
}));

vi.mock("@fairy/database", () => ({
  prisma: {
    opsSuggestion: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const NOW = new Date(2026, 8, 23, 12, 0, 0);

function trendFixture(borrowCounts: number[]): DailyBorrowPoint[] {
  return borrowCounts.map((borrowCount, index) => ({
    date: `2026-09-${String(23 - (borrowCounts.length - 1 - index)).padStart(2, "0")}`,
    borrowCount,
    returnCount: 0,
  }));
}

function overviewFixture(overrides: Partial<StoreInsightsOverview> = {}): StoreInsightsOverview {
  return {
    popularMovies: [],
    trend: trendFixture(new Array(14).fill(2)),
    inventory: { activeRentals: 2, borrowedRatio: 0.2, lowStockMovies: [] },
    moods: [],
    scenes: [],
    activity: { totalUsers: 5, activeUsers7d: 3, newUsers7d: 1 },
    ...overrides,
  };
}

function suggestionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    kind: "LOW_STOCK",
    summary: "《教父》库存告急",
    body: "目前仅剩 0 盒在库，建议尽快补货。",
    sourceData: { movieId: "m1", title: "教父", stock: 0, totalStock: 2 },
    readAt: null,
    createdAt: new Date("2026-09-23T04:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tryChat).mockResolvedValue(null); // 缺省：LLM 不可用 → 模板降级
  vi.mocked(getStoreInsightsOverview).mockResolvedValue(overviewFixture());
  vi.mocked(prisma.opsSuggestion.create).mockResolvedValue(suggestionRow() as never);
  vi.mocked(prisma.opsSuggestion.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.opsSuggestion.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.opsSuggestion.count).mockResolvedValue(0 as never);
});

describe("detectThresholdAnomalies", () => {
  it("emits one LOW_STOCK draft per low-stock movie with movie-scoped keys", async () => {
    vi.mocked(getStoreInsightsOverview).mockResolvedValue(
      overviewFixture({
        inventory: {
          activeRentals: 2,
          borrowedRatio: 0.2,
          lowStockMovies: [
            { movieId: "m1", title: "教父", stock: 0, totalStock: 2 },
            { movieId: "m2", title: "楚门的世界", stock: 1, totalStock: 1 },
          ],
        },
      }),
    );

    const drafts = await detectThresholdAnomalies(NOW);

    expect(drafts.map((draft) => draft.dedupeKey)).toEqual(["LOW_STOCK:m1", "LOW_STOCK:m2"]);
    expect(drafts[0].kind).toBe("LOW_STOCK");
    expect(drafts[0].summary).toContain("教父");
    expect(drafts[0].sourceData).toMatchObject({ title: "教父", stock: 0 });
  });

  it("emits BORROW_RATIO when the ratio reaches the threshold", async () => {
    vi.mocked(getStoreInsightsOverview).mockResolvedValue(
      overviewFixture({
        inventory: { activeRentals: 8, borrowedRatio: 0.8, lowStockMovies: [] },
      }),
    );

    const drafts = await detectThresholdAnomalies(NOW);

    expect(drafts.map((draft) => draft.dedupeKey)).toEqual(["BORROW_RATIO:store"]);
    expect(drafts[0].sourceData).toMatchObject({ activeRentals: 8, borrowedRatio: 0.8 });
  });

  it("emits DORMANT only when the last 7 days have no borrows", async () => {
    vi.mocked(getStoreInsightsOverview).mockResolvedValue(
      overviewFixture({ trend: trendFixture([...new Array(7).fill(0), 3, 3, 3, 3, 3, 3, 3]) }),
    );
    await expect(detectThresholdAnomalies(NOW)).resolves.toEqual([]);

    vi.mocked(getStoreInsightsOverview).mockResolvedValue(
      overviewFixture({ trend: trendFixture(new Array(14).fill(0)) }),
    );
    const drafts = await detectThresholdAnomalies(NOW);
    expect(drafts.map((draft) => draft.dedupeKey)).toEqual(["DORMANT:store"]);
  });

  it("emits nothing when no threshold holds", async () => {
    await expect(detectThresholdAnomalies(NOW)).resolves.toEqual([]);
  });
});

describe("runThresholdCycle", () => {
  it("persists one suggestion per detected anomaly", async () => {
    vi.mocked(getStoreInsightsOverview).mockResolvedValue(
      overviewFixture({
        inventory: {
          activeRentals: 8,
          borrowedRatio: 0.8,
          lowStockMovies: [{ movieId: "m1", title: "教父", stock: 0, totalStock: 2 }],
        },
      }),
    );

    const result = await runThresholdCycle(NOW);

    expect(result).toEqual({ created: 2, skipped: 0, closed: 0 });
    expect(prisma.opsSuggestion.create).toHaveBeenCalledTimes(2);
    expect(prisma.opsSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "LOW_STOCK",
        dedupeKey: "LOW_STOCK:m1",
        body: "目前仅剩 0 盒在库，建议尽快补货。",
      }),
    });
  });

  it("counts a P2002 duplicate-key rejection as skipped without throwing", async () => {
    vi.mocked(getStoreInsightsOverview).mockResolvedValue(
      overviewFixture({
        inventory: {
          activeRentals: 2,
          borrowedRatio: 0.2,
          lowStockMovies: [{ movieId: "m1", title: "教父", stock: 0, totalStock: 2 }],
        },
      }),
    );
    vi.mocked(prisma.opsSuggestion.create).mockRejectedValue({ code: "P2002" } as never);

    const result = await runThresholdCycle(NOW);

    expect(result).toEqual({ created: 0, skipped: 1, closed: 0 });
  });

  it("propagates non-duplicate persistence errors", async () => {
    vi.mocked(getStoreInsightsOverview).mockResolvedValue(
      overviewFixture({
        inventory: {
          activeRentals: 2,
          borrowedRatio: 0.2,
          lowStockMovies: [{ movieId: "m1", title: "教父", stock: 0, totalStock: 2 }],
        },
      }),
    );
    vi.mocked(prisma.opsSuggestion.create).mockRejectedValue(new Error("db down"));

    await expect(runThresholdCycle(NOW)).rejects.toThrow("db down");
  });

  it("closes suggestions whose anomalies recovered and keeps active ones", async () => {
    // 第一周期：两部影片低库存 + 冷清 → 落库
    vi.mocked(getStoreInsightsOverview).mockResolvedValueOnce(
      overviewFixture({
        trend: trendFixture(new Array(14).fill(0)),
        inventory: {
          activeRentals: 2,
          borrowedRatio: 0.2,
          lowStockMovies: [
            { movieId: "m1", title: "教父", stock: 0, totalStock: 2 },
            { movieId: "m2", title: "小王子", stock: 1, totalStock: 1 },
          ],
        },
      }),
    );
    await runThresholdCycle(NOW);
    expect(prisma.opsSuggestion.create).toHaveBeenCalledTimes(3);

    // 第二周期：m2 回补、冷清恢复，仅 m1 仍低库存；m1 的建议已在库，
    // 重建被唯一索引挡下（P2002 → skipped），其余两个键被判定恢复并删除
    vi.mocked(getStoreInsightsOverview).mockResolvedValueOnce(
      overviewFixture({
        inventory: {
          activeRentals: 2,
          borrowedRatio: 0.2,
          lowStockMovies: [{ movieId: "m1", title: "教父", stock: 0, totalStock: 2 }],
        },
      }),
    );
    vi.mocked(prisma.opsSuggestion.create).mockRejectedValue({ code: "P2002" } as never);
    vi.mocked(prisma.opsSuggestion.findMany).mockResolvedValue([
      { dedupeKey: "LOW_STOCK:m1" },
      { dedupeKey: "LOW_STOCK:m2" },
      { dedupeKey: "DORMANT:store" },
    ] as never);
    vi.mocked(prisma.opsSuggestion.deleteMany).mockResolvedValue({ count: 2 } as never);

    const result = await runThresholdCycle(NOW);

    expect(prisma.opsSuggestion.deleteMany).toHaveBeenCalledWith({
      where: { dedupeKey: { in: ["LOW_STOCK:m2", "DORMANT:store"] } },
    });
    expect(result.closed).toBe(2);
    expect(result.skipped).toBe(1); // m1 的建议仍在活跃期，重建被唯一索引挡下
  });
});

describe("generateSuggestion", () => {
  const draft = {
    kind: "LOW_STOCK" as const,
    dedupeKey: "LOW_STOCK:m1",
    summary: "《教父》库存告急",
    body: "目前仅剩 0 盒在库，建议尽快补货。",
    sourceData: { title: "教父", stock: 0 },
  };

  it("falls back to the template body when the provider is unavailable", async () => {
    const generated = await generateSuggestion(draft);

    expect(generated).toEqual({
      summary: draft.summary,
      body: draft.body,
      degraded: true,
    });
    expect(tryChat).toHaveBeenCalledWith(
      "agent.suggestion",
      expect.any(Array),
      expect.objectContaining({ maxTokens: 3000, temperature: 0.4 }),
    );
  });

  it("uses the LLM body when the provider answers", async () => {
    vi.mocked(tryChat).mockResolvedValue({
      text: "  《教父》快没货了，只有 0 盒在库，建议今天补货。  ",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: "test-model",
      provider: "deepseek",
    });

    const generated = await generateSuggestion(draft);

    expect(generated.degraded).toBe(false);
    expect(generated.body).toBe("《教父》快没货了，只有 0 盒在库，建议今天补货。");
    // prompt 只放聚合快照，不含任何用户身份/行为字段
    const [, messages] = vi.mocked(tryChat).mock.calls[0];
    expect(JSON.stringify(messages)).toContain("教父");
    expect(JSON.stringify(messages)).not.toContain("email");
  });

  it("falls back when the provider returns blank text", async () => {
    vi.mocked(tryChat).mockResolvedValue({
      text: "   ",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: "test-model",
      provider: "deepseek",
    });

    await expect(generateSuggestion(draft)).resolves.toMatchObject({ degraded: true });
  });
});

describe("generateDailyReport", () => {
  it("creates the day's report and keys it by local date", async () => {
    vi.mocked(prisma.opsSuggestion.findUnique).mockResolvedValue(null as never);

    const suggestion = await generateDailyReport(NOW);

    expect(prisma.opsSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "DAILY_REPORT",
        dedupeKey: "DAILY_REPORT:2026-09-23",
      }),
    });
    expect(suggestion.id).toBe(suggestionRow().id);
    expect(suggestion.createdAt).toBe("2026-09-23T04:00:00.000Z");
  });

  it("is same-day idempotent: an existing report is returned without a second create", async () => {
    vi.mocked(prisma.opsSuggestion.findUnique).mockResolvedValue(suggestionRow() as never);

    const first = await generateDailyReport(NOW);
    const second = await generateDailyReport(NOW);

    expect(first).toEqual(second);
    expect(prisma.opsSuggestion.create).not.toHaveBeenCalled();
    expect(prisma.opsSuggestion.findUnique).toHaveBeenCalledTimes(2);
  });

  it("reads back the winner on a concurrent P2002 race", async () => {
    vi.mocked(prisma.opsSuggestion.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(suggestionRow() as never);
    vi.mocked(prisma.opsSuggestion.create).mockRejectedValue({ code: "P2002" } as never);

    const suggestion = await generateDailyReport(NOW);

    expect(suggestion.id).toBe(suggestionRow().id);
    expect(prisma.opsSuggestion.create).toHaveBeenCalledTimes(1);
  });

  it("propagates a non-duplicate error when the re-read also fails", async () => {
    vi.mocked(prisma.opsSuggestion.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.opsSuggestion.create).mockRejectedValue(new Error("db down"));

    await expect(generateDailyReport(NOW)).rejects.toThrow("db down");
  });
});

describe("suggestion read model", () => {
  it("lists newest first with pagination windows", async () => {
    vi.mocked(prisma.opsSuggestion.findMany).mockResolvedValue([
      suggestionRow(),
      suggestionRow({ id: "another-id" }),
    ] as never);
    vi.mocked(prisma.opsSuggestion.count).mockResolvedValue(5 as never);

    const { items, total } = await listSuggestions({ page: 2, limit: 2 });

    expect(prisma.opsSuggestion.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      skip: 2,
      take: 2,
    });
    expect(total).toBe(5);
    expect(items[0].createdAt).toBe("2026-09-23T04:00:00.000Z");
    expect(items[0].readAt).toBeNull();
  });

  it("counts unread suggestions across all kinds", async () => {
    vi.mocked(prisma.opsSuggestion.count).mockResolvedValue(4 as never);

    await expect(getUnreadCount()).resolves.toBe(4);
    expect(prisma.opsSuggestion.count).toHaveBeenCalledWith({ where: { readAt: null } });
  });

  it("marks an unread suggestion read once and stays idempotent", async () => {
    const unread = suggestionRow();
    vi.mocked(prisma.opsSuggestion.findUnique).mockResolvedValue(unread as never);
    vi.mocked(prisma.opsSuggestion.update).mockResolvedValue(
      suggestionRow({ readAt: new Date("2026-09-23T06:00:00.000Z") }) as never,
    );

    const marked = await markRead("550e8400-e29b-41d4-a716-446655440000");
    expect(marked?.readAt).toBe("2026-09-23T06:00:00.000Z");
    expect(prisma.opsSuggestion.update).toHaveBeenCalledTimes(1);

    const alreadyRead = suggestionRow({ readAt: new Date("2026-09-23T06:00:00.000Z") });
    vi.mocked(prisma.opsSuggestion.findUnique).mockResolvedValue(alreadyRead as never);
    const again = await markRead("550e8400-e29b-41d4-a716-446655440000");
    expect(again?.readAt).toBe("2026-09-23T06:00:00.000Z");
    expect(prisma.opsSuggestion.update).toHaveBeenCalledTimes(1); // 时间戳不变
  });

  it("returns null for an unknown suggestion id", async () => {
    vi.mocked(prisma.opsSuggestion.findUnique).mockResolvedValue(null as never);

    await expect(markRead("missing")).resolves.toBeNull();
    expect(prisma.opsSuggestion.update).not.toHaveBeenCalled();
  });
});

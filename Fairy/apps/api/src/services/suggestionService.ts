import { prisma } from "@fairy/database";
import type { Suggestion, SuggestionListQuery, StoreInsightsOverview } from "@fairy/shared";
import { getStoreInsightsOverview, toLocalDateKey } from "./insightService";
import { tryChat } from "../agent/llmClient";

// 2026-09-23-proactive-ops-suggestions：主动运营建议服务层。
// 阈值/日报的触发判定复用 insightService 的只读聚合（单一事实来源）；
// 生成走统一 AI SDK chat()，失败降级模板摘要（AGENTS §0 降级哲学）；
// 去重以 dedupeKey 唯一索引为唯一事实来源：写入前先按存量键查重（不为已存在者调用 LLM），
// 并发下后到一方再以 P2002 兜底视为已存在。

export const BORROW_RATIO_THRESHOLD = 0.8;
export const DORMANT_DAYS = 7;
export const DETECTION_INTERVAL_MINUTES = 15;
export const DAILY_HOUR = 8;
/** 起草正文的 token 预算：须容纳 reasoning 模型的思考消耗，否则答案被拦腰截断。 */
export const SUGGESTION_MAX_TOKENS = 3000;

const KIND_LABELS: Record<Suggestion["kind"], string> = {
  LOW_STOCK: "低库存",
  BORROW_RATIO: "高借出率",
  DORMANT: "零借阅冷清",
  DAILY_REPORT: "每日经营日报",
};

export interface SuggestionDraft {
  kind: Suggestion["kind"];
  dedupeKey: string;
  /** 单行标题：始终取模板措辞，作为去重语义的人工可读标签。 */
  summary: string;
  /** 模板正文：LLM 不可用/失败时的降级内容。 */
  body: string;
  sourceData: Record<string, unknown>;
}

const SUGGESTION_SYSTEM_PROMPT = [
  "你是 Fairy，一家录像带租赁门店的智能运营助手。",
  "根据给定的经营数据写一段中文运营建议。",
  "要求：只能使用给定数据中的信息，禁止编造任何数字或影片名；",
  "语气亲切、具体，像店长给店员的叮嘱；",
  "不超过 300 字，列 2-4 个要点，每点一行；",
  "不要输出 Markdown 标记，不要复述本条指令。",
].join("\n");

function buildThresholdDrafts(
  overview: StoreInsightsOverview,
  recentBorrowSum: number,
): SuggestionDraft[] {
  const drafts: SuggestionDraft[] = [];

  // 低库存：与洞察看板同一阈值（stock <= LOW_STOCK_THRESHOLD），每部影片一条
  for (const movie of overview.inventory.lowStockMovies) {
    drafts.push({
      kind: "LOW_STOCK",
      dedupeKey: `LOW_STOCK:${movie.movieId}`,
      summary: `《${movie.title}》库存告急`,
      body: `目前仅剩 ${movie.stock} 盒在库，建议尽快补货。`,
      sourceData: {
        movieId: movie.movieId,
        title: movie.title,
        stock: movie.stock,
        totalStock: movie.totalStock,
      },
    });
  }

  if (overview.inventory.borrowedRatio >= BORROW_RATIO_THRESHOLD) {
    drafts.push({
      kind: "BORROW_RATIO",
      dedupeKey: "BORROW_RATIO:store",
      summary: "借出率过高",
      body: `当前 ${overview.inventory.activeRentals} 盒在借，占总库存 ${Math.round(
        overview.inventory.borrowedRatio * 100,
      )}%，建议关注归还节奏与补货。`,
      sourceData: {
        activeRentals: overview.inventory.activeRentals,
        borrowedRatio: overview.inventory.borrowedRatio,
      },
    });
  }

  if (recentBorrowSum === 0) {
    drafts.push({
      kind: "DORMANT",
      dedupeKey: "DORMANT:store",
      summary: "门店近 7 天零借阅",
      body: `过去 ${DORMANT_DAYS} 天没有任何借阅记录，建议策划促销或精选推荐唤醒需求。`,
      sourceData: { days: DORMANT_DAYS, borrowSum: 0 },
    });
  }

  return drafts;
}

function buildDailyDraft(overview: StoreInsightsOverview, now: Date): SuggestionDraft {
  const borrowSum = overview.trend.reduce((sum, point) => sum + point.borrowCount, 0);
  const returnSum = overview.trend.reduce((sum, point) => sum + point.returnCount, 0);
  const lowTitles = overview.inventory.lowStockMovies.map((movie) => `《${movie.title}》`);
  const body = [
    "今日经营速览：",
    `· 在借 ${overview.inventory.activeRentals} 盒，借出率 ${Math.round(
      overview.inventory.borrowedRatio * 100,
    )}%`,
    `· 近 ${overview.trend.length} 天借阅 ${borrowSum} 次、归还 ${returnSum} 次`,
    `· 低库存影片 ${overview.inventory.lowStockMovies.length} 部${
      lowTitles.length > 0 ? `（${lowTitles.join("、")}）` : ""
    }`,
    `· 活跃用户 ${overview.activity.activeUsers7d} 位，新增 ${overview.activity.newUsers7d} 位`,
  ].join("\n");
  return {
    kind: "DAILY_REPORT",
    dedupeKey: `DAILY_REPORT:${toLocalDateKey(now)}`,
    summary: `经营日报 · ${toLocalDateKey(now)}`,
    body,
    sourceData: overview as unknown as Record<string, unknown>,
  };
}

export async function detectThresholdAnomalies(now: Date = new Date()): Promise<SuggestionDraft[]> {
  const overview = await getStoreInsightsOverview(now);
  // 近 7 天借阅量取趋势窗口末 7 天（趋势为本地日桶，末日即今天）
  const recentBorrowSum = overview.trend
    .slice(-DORMANT_DAYS)
    .reduce((sum, point) => sum + point.borrowCount, 0);
  return buildThresholdDrafts(overview, recentBorrowSum);
}

export interface GeneratedSuggestion {
  summary: string;
  body: string;
  /** true 表示走了模板降级（LLM 不可用/失败/空输出）。 */
  degraded: boolean;
}

export async function generateSuggestion(draft: SuggestionDraft): Promise<GeneratedSuggestion> {
  const fallback = { summary: draft.summary, body: draft.body, degraded: true };
  const messages = [
    { role: "system" as const, content: SUGGESTION_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `建议类型：${KIND_LABELS[draft.kind]}\n经营数据：${JSON.stringify(draft.sourceData)}`,
    },
  ];
  // tryChat 已保证：无 key / provider 错误时返回 null 且日志不含响应负载（§5）。
  // max_tokens 必须覆盖 reasoning 消耗：deepseek-v4-flash 会先产出数百至上千 reasoning token，
  // 800/2000 的预算都会把答案掐断（finish_reason=length，content 为空或半句），3000 实测可完整收尾。
  const result = await tryChat("agent.suggestion", messages, {
    maxTokens: SUGGESTION_MAX_TOKENS,
    temperature: 0.4,
  });
  if (!result || !result.text.trim()) {
    return fallback;
  }
  return { summary: draft.summary, body: result.text.trim(), degraded: false };
}

function isDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

type OpsSuggestionRow = {
  id: string;
  kind: Suggestion["kind"];
  summary: string;
  body: string;
  sourceData: unknown;
  readAt: Date | null;
  createdAt: Date;
};

function toSuggestion(row: OpsSuggestionRow): Suggestion {
  return {
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    body: row.body,
    sourceData: row.sourceData,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CycleResult {
  created: number;
  skipped: number;
  closed: number;
}

export async function runThresholdCycle(now: Date = new Date()): Promise<CycleResult> {
  const drafts = await detectThresholdAnomalies(now);
  const activeKeys = new Set(drafts.map((draft) => draft.dedupeKey));

  // 存量阈值建议一次取回：既用于「已存在的键不再重复生成」，也用于末段的恢复清理。
  // 生成发生在落库之前，若不在写入前查重，持续存在的异常会让每个周期都为同一批建议白烧
  // 一轮 LLM——2026-10-27 容器冒烟实测：15 个异常 → 15 次调用、created: 0，约 9k token
  // 全部丢弃，且每 15 分钟重复一次。日报路径（generateDailyReport）早有先手查重，此处补齐。
  const stored = await prisma.opsSuggestion.findMany({
    where: { kind: { in: ["LOW_STOCK", "BORROW_RATIO", "DORMANT"] } },
    select: { dedupeKey: true },
  });
  const storedKeys = new Set(stored.map((row) => row.dedupeKey));
  // 已处理键 = 存量 ∪ 本周期刚落库（或被唯一索引挡下）的，避免同周期内重复生成
  const handledKeys = new Set(storedKeys);

  let created = 0;
  let skipped = 0;
  for (const draft of drafts) {
    if (handledKeys.has(draft.dedupeKey)) {
      // 同一异常的建议已在库：直接视为已存在，不调用 LLM
      skipped += 1;
      continue;
    }
    const generated = await generateSuggestion(draft);
    try {
      await prisma.opsSuggestion.create({
        data: {
          kind: draft.kind,
          dedupeKey: draft.dedupeKey,
          summary: generated.summary,
          body: generated.body,
          sourceData: draft.sourceData as object,
        },
      });
      created += 1;
    } catch (error) {
      if (!isDuplicateError(error)) {
        throw error;
      }
      // 并发或多实例下唯一索引兜底：视为已存在，绝不重复生成
      skipped += 1;
    }
    handledKeys.add(draft.dedupeKey);
  }

  // 恢复清理：活跃异常集合之外的存量阈值建议全部删除（库存回补、借出率回落、借阅恢复）。
  // 异常重现时作为全新建议重新落库（新 createdAt、未读态）。
  const staleKeys = [...storedKeys].filter((key) => !activeKeys.has(key));
  let closed = 0;
  if (staleKeys.length > 0) {
    const { count } = await prisma.opsSuggestion.deleteMany({
      where: { dedupeKey: { in: staleKeys } },
    });
    closed = count;
  }

  return { created, skipped, closed };
}

export async function generateDailyReport(now: Date = new Date()): Promise<Suggestion> {
  const overview = await getStoreInsightsOverview(now);
  const draft = buildDailyDraft(overview, now);

  const existing = await prisma.opsSuggestion.findUnique({ where: { dedupeKey: draft.dedupeKey } });
  if (existing) {
    return toSuggestion(existing);
  }

  const generated = await generateSuggestion(draft);
  try {
    const row = await prisma.opsSuggestion.create({
      data: {
        kind: draft.kind,
        dedupeKey: draft.dedupeKey,
        summary: generated.summary,
        body: generated.body,
        sourceData: draft.sourceData as object,
      },
    });
    return toSuggestion(row);
  } catch (error) {
    if (isDuplicateError(error)) {
      // 并发抢跑：当日已有他方生成，读回同一产物（当日幂等）
      const raced = await prisma.opsSuggestion.findUnique({
        where: { dedupeKey: draft.dedupeKey },
      });
      if (raced) {
        return toSuggestion(raced);
      }
    }
    throw error;
  }
}

export async function listSuggestions(
  query: SuggestionListQuery,
): Promise<{ items: Suggestion[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.opsSuggestion.findMany({
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.opsSuggestion.count(),
  ]);
  return { items: rows.map(toSuggestion), total };
}

export async function getUnreadCount(): Promise<number> {
  return prisma.opsSuggestion.count({ where: { readAt: null } });
}

export async function markRead(id: string): Promise<Suggestion | null> {
  const existing = await prisma.opsSuggestion.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }
  const row = existing.readAt
    ? existing
    : await prisma.opsSuggestion.update({ where: { id }, data: { readAt: new Date() } });
  return toSuggestion(row);
}

/**
 * FU-20：存量 Trip 同行人快照幂等回填脚本（tsx 运行，不参与 CI）。
 *
 * 用法（monorepo 根 Fairy/ 下）：
 *   pnpm --filter=@fairy/database backfill:trip-companions
 *
 * 行为：
 * - 键集分页扫 `behavior_logs` 中 `action = 'TRIP_PLANNED'` 且 payload 带 `companionName` 的记录；
 * - 按 `payload.tripId` 定位 `trips` 行，仅当两列皆空时更新（幂等：重跑时已补行走「已跳过」分支，
 *   数值不再变化）；
 * - payload 只有姓名没有 userId 的旧记录跳过并单独计数（契约层两列缺一即无同行人，不写半截快照）；
 * - 逐条失败不中断，结束打印统计；存在失败或损坏负载时退出码为 1（便于 CI/人工发现后重跑）。
 *
 * 环境变量读取：apps/api/.env 与 packages/database/.env（后者含 DATABASE_URL）。
 * 注意：本脚本不经过 API 启动校验，运行前请确认两处 DATABASE_URL 一致（AGENTS §9）。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, Prisma } from "../packages/database/src/index.ts";
import { readCompanionFromPayload } from "../packages/database/src/tripCompanionBackfill.ts";

const BATCH_SIZE = 100;

interface TripPlannedLogRow {
  id: string;
  createdAt: Date;
  payload: unknown;
}

interface Stats {
  scanned: number;
  backfilled: number;
  skipped: number;
  nameOnly: number;
  noCompanion: number;
  malformed: number;
  missingTrip: number;
  noLog: number;
  failed: number;
  batches: number;
}

/** 极简 .env 加载：真实环境变量优先；忽略注释与空行；不做插值展开。 */
function loadEnvFile(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function fetchBatch(
  cursor: { createdAt: Date; id: string } | null,
): Promise<TripPlannedLogRow[]> {
  // 键集分页（createdAt, id）：日志表只增不改，游标稳定推进，不会因 LIMIT 偏移量漏行或重复
  const after = cursor
    ? Prisma.sql`AND ("createdAt" > ${cursor.createdAt} OR ("createdAt" = ${cursor.createdAt} AND "id" > ${cursor.id}))`
    : Prisma.empty;
  return prisma.$queryRaw<TripPlannedLogRow[]>(Prisma.sql`
    SELECT "id", "createdAt", "payload"
    FROM "behavior_logs"
    WHERE "action" = 'TRIP_PLANNED'::"BehaviorAction"
      AND "payload"->>'companionName' IS NOT NULL
      ${after}
    ORDER BY "createdAt", "id"
    LIMIT ${BATCH_SIZE}
  `);
}

/** 仍无同行人、且没有任何可用 TRIP_PLANNED 日志可恢复的行程数（本来就没和同行人规划过）。 */
async function countTripsWithoutRecoverableLog(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT count(*)::int AS "count"
    FROM "trips" t
    WHERE t."companionName" IS NULL
      AND t."companionUserId" IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "behavior_logs" b
        WHERE b."action" = 'TRIP_PLANNED'::"BehaviorAction"
          AND b."payload"->>'tripId' = t."id"
          AND b."payload"->>'companionName' IS NOT NULL
          AND b."payload"->>'companionUserId' IS NOT NULL
      )
  `);
  return rows[0]?.count ?? 0;
}

async function main(): Promise<void> {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptsDir, "..");
  loadEnvFile(resolve(projectRoot, "apps/api/.env"));
  loadEnvFile(resolve(projectRoot, "packages/database/.env"));

  const stats: Stats = {
    scanned: 0,
    backfilled: 0,
    skipped: 0,
    nameOnly: 0,
    noCompanion: 0,
    malformed: 0,
    missingTrip: 0,
    noLog: 0,
    failed: 0,
    batches: 0,
  };
  const startedAt = Date.now();
  let cursor: { createdAt: Date; id: string } | null = null;

  for (;;) {
    const batch = await fetchBatch(cursor);
    if (batch.length === 0) {
      break;
    }
    stats.batches += 1;
    cursor = { createdAt: batch[batch.length - 1].createdAt, id: batch[batch.length - 1].id };

    for (const row of batch) {
      stats.scanned += 1;
      const read = readCompanionFromPayload(row.payload);
      if (read.kind === "no-companion") {
        stats.noCompanion += 1;
        continue;
      }
      if (read.kind === "malformed") {
        stats.malformed += 1;
        console.warn(`[backfill-trip-companions] log ${row.id} has an unusable payload; skipped`);
        continue;
      }
      if (read.kind === "name-only") {
        stats.nameOnly += 1;
        console.warn(
          `[backfill-trip-companions] log ${row.id} carries a name without userId; skipped`,
        );
        continue;
      }

      const { tripId, name, userId } = read.snapshot;
      try {
        // where 带两列皆空：检查与写入原子完成，重跑不会覆盖已回填的值
        const { count } = await prisma.trip.updateMany({
          where: { id: tripId, companionName: null, companionUserId: null },
          data: { companionName: name, companionUserId: userId },
        });
        if (count === 1) {
          stats.backfilled += 1;
          continue;
        }
        const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
        if (trip) {
          stats.skipped += 1;
        } else {
          stats.missingTrip += 1;
          console.warn(
            `[backfill-trip-companions] log ${row.id} points at a deleted trip ${tripId}`,
          );
        }
      } catch (error) {
        stats.failed += 1;
        const message = error instanceof Error ? error.message : "unknown error";
        console.warn(`[backfill-trip-companions] trip ${tripId} failed: ${message}`);
      }
    }

    console.log(
      `[backfill-trip-companions] batch ${stats.batches}: scanned ${stats.scanned}, backfilled ${stats.backfilled}, skipped ${stats.skipped}`,
    );
  }

  stats.noLog = await countTripsWithoutRecoverableLog();

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[backfill-trip-companions] done in ${seconds}s — scanned ${stats.scanned}, backfilled ${stats.backfilled}, skipped ${stats.skipped}, nameOnly ${stats.nameOnly}, noCompanion ${stats.noCompanion}, malformed ${stats.malformed}, missingTrip ${stats.missingTrip}, noLog ${stats.noLog}, failed ${stats.failed}, batches ${stats.batches}`,
  );
  if (stats.failed > 0 || stats.malformed > 0) {
    // 逐条失败不中断，但用退出码告知调用方本次回填不完整（瞬时失败可重跑脚本重试）
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[backfill-trip-companions] aborted: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

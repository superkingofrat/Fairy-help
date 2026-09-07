/**
 * FU-16：存量记忆 embedding 幂等回填脚本（tsx 运行，不参与 CI）。
 *
 * 用法（monorepo 根 Fairy/ 下）：
 *   pnpm --filter=@fairy/database backfill:embeddings
 *
 * 行为：
 * - 仅选取 `embedding IS NULL` 的 memories 行（幂等：已回填的行二次运行不再调用 embed）；
 * - 逐条 embed → raw `UPDATE ... SET embedding = $1::vector`，单条失败不中断，结束打印统计；
 * - 未配置 EMBEDDING_API_KEY（或回退 OPENAI_API_KEY）时打印提示并直接退出（零行为变化）。
 *
 * 环境变量读取：apps/api/.env 与 packages/database/.env（后者含 DATABASE_URL）。
 * 注意：本脚本不经过 API 启动校验，运行前请确认两处 DATABASE_URL 一致（AGENTS §9）。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, Prisma } from "../packages/database/src/index.ts";
import {
  createEmbeddingProvider,
  EMBEDDING_DIMENSIONS,
  type AiProvider,
} from "../packages/ai-sdk/src/index.ts";

const BATCH_SIZE = 20;

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

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

async function main(): Promise<void> {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptsDir, "..");
  loadEnvFile(resolve(projectRoot, "apps/api/.env"));
  loadEnvFile(resolve(projectRoot, "packages/database/.env"));

  const provider: AiProvider | null = createEmbeddingProvider();
  if (!provider) {
    console.log(
      "[backfill-memory-embeddings] 未配置 EMBEDDING_API_KEY（缺省回退 OPENAI_API_KEY），跳过回填。",
    );
    return;
  }
  console.log(
    `[backfill-memory-embeddings] embed model: ${provider.defaultModel}`,
  );

  const stats = { embedded: 0, skipped: 0, failed: 0, batches: 0 };
  const startedAt = Date.now();

  // 幂等：只取 embedding 为 NULL 的行，循环处理直到没有剩余。
  for (;;) {
    const pending = await prisma.$queryRaw<
      Array<{ id: string; content: string }>
    >(Prisma.sql`
      SELECT "id", "content"
      FROM "memories"
      WHERE "embedding" IS NULL
      ORDER BY "createdAt"
      LIMIT ${BATCH_SIZE}
    `);
    if (pending.length === 0) {
      break;
    }
    stats.batches += 1;

    for (const row of pending) {
      if (!row.content.trim()) {
        stats.skipped += 1;
        continue;
      }
      try {
        const { vectors } = await provider.embed({ input: row.content });
        const vector = vectors[0];
        if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
          console.warn(
            `[backfill-memory-embeddings] skip ${row.id}: expected ${EMBEDDING_DIMENSIONS} dims, got ${vector?.length ?? 0}`,
          );
          stats.skipped += 1;
          continue;
        }
        await prisma.$executeRaw(Prisma.sql`
          UPDATE "memories"
          SET "embedding" = ${vectorLiteral(vector)}::vector
          WHERE "id" = ${row.id}
        `);
        stats.embedded += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown error";
        console.warn(
          `[backfill-memory-embeddings] row ${row.id} failed: ${message}`,
        );
        stats.failed += 1;
      }
    }
    console.log(
      `[backfill-memory-embeddings] batch ${stats.batches}: embedded ${stats.embedded}, skipped ${stats.skipped}, failed ${stats.failed}`,
    );
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[backfill-memory-embeddings] done in ${seconds}s — embedded ${stats.embedded}, skipped ${stats.skipped}, failed ${stats.failed}, batches ${stats.batches}`,
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[backfill-memory-embeddings] aborted: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

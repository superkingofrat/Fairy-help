-- 主动运营建议（OpenSpec 2026-09-23-proactive-ops-suggestions）：
-- Fairy 定时生成的经营建议（低库存/借出率/冷清预警/每日日报）。
-- dedupeKey 唯一索引是去重语义的唯一事实来源：同一异常恢复前不重复生成，
-- 恢复时由服务删除该键建议，异常重现时作为全新建议重新落库。
-- sourceData Json 存触发时的真实聚合快照（只含影片/库存/聚合数字，无用户隐私字段）。

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('LOW_STOCK', 'BORROW_RATIO', 'DORMANT', 'DAILY_REPORT');

-- CreateTable
CREATE TABLE "ops_suggestions" (
    "id" TEXT NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceData" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ops_suggestions_dedupeKey_key" ON "ops_suggestions"("dedupeKey");

-- CreateIndex
CREATE INDEX "ops_suggestions_createdAt_idx" ON "ops_suggestions"("createdAt");

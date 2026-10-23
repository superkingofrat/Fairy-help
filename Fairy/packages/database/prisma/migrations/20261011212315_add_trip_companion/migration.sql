-- FU-20 同行人快照（OpenSpec 2026-10-11-trip-companion-context）：
-- 行程落库时命中的同行人（姓名 + 画像 id），供对话回复归属偏好、历史回放与 REST 详情展示。
-- 刻意不加外键与索引：同行人是规划时快照而非引用（画像名可能已改、persona 可能已删），
-- 行程要留住「当时和谁一起去」这个事实；userId 不参与过滤/连接，加索引无收益。
-- 存量行的回填由 scripts/backfill-trip-companions.ts 从 TRIP_PLANNED 日志幂等完成，不在迁移内做。

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "companionName" TEXT,
ADD COLUMN     "companionUserId" TEXT;

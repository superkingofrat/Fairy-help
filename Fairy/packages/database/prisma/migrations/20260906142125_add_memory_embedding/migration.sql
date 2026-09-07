-- FU-16：pgvector 扩展（Neon 原生支持）。Prisma 不跟踪扩展，需显式创建。
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "memories" ADD COLUMN     "embedding" vector(1536);

-- FU-16：HNSW（cosine）索引——可空列，回填前无向量行不参与索引。名称带 embedding 便于识别。
CREATE INDEX "memories_embedding_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);

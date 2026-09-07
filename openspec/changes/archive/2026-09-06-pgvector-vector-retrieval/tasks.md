# Tasks: 2026-09-06-pgvector-vector-retrieval

## 1. 数据库

- [x] 1.1 `schema.prisma`：`Memory` 增加 `embedding Unsupported("vector(1536)")?`（注释说明 raw SQL 读写 + 永不下发）
- [x] 1.2 生成迁移 `add_memory_embedding`（`CREATE EXTENSION IF NOT EXISTS vector;` + `ALTER TABLE memories ADD COLUMN embedding vector(1536);` + `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`），`migrate:dev` + `generate`

## 2. ai-sdk：embed 客户端解耦

- [x] 2.1 新增 embed 客户端可选创建入口：`EMBEDDING_API_KEY`（缺省回退 `OPENAI_API_KEY`）+ `EMBEDDING_MODEL`（默认 `text-embedding-3-small`）；无 key → `null`（降级信号，非 typed missing-key）；供应商逻辑只在 ai-sdk 内
- [x] 2.2 测试：`AI_PROVIDER=deepseek` + `EMBEDDING_API_KEY` 时 embed 走 openai 模型（fetch mock）；无 key → null 且 chat 不受影响

## 3. API：memory 模块混合检索 + 实时 embed

- [x] 3.1 新增 embedding 辅助（memoize 客户端、`embedContent(content) → number[] | null`、1536 维守卫、raw `UPDATE memories SET embedding=$1::vector WHERE id=$2`）
- [x] 3.2 `addMemory`（抽取旁路 + admin createMemory 共用）落库后实时 embed 写回；失败/超长静默（仅日志），记忆本体不丢
- [x] 3.3 `searchMemories` 混合检索：向量 top-N（`profileId` 必填 + `kind`/`keyword` 预过滤 + cosine 升序）→ 结构化补齐 → 无 embed/无向量走既有 `findMany`；签名与 ≤limit 语义不变
- [x] 3.4 测试：`vi.mock` embed + 测试库 raw 伪向量——向量排序优先于时间倒序、召回不足补齐、`kind`/`keyword` 预过滤、无 key 全结构化、用户隔离、≤limit、1536 守卫降级；既有 memoryService/chat/contextBuilder 用例保持绿

## 4. 回填脚本

- [x] 4.1 `Fairy/scripts/backfill-memory-embeddings.ts`（tsx）：选 `embedding IS NULL` 分批 → embed → raw UPDATE；逐条失败不中断；幂等可重跑；打印统计；无 key 提示退出；CI 不执行

## 5. 文档

- [x] 5.1 `ARCHITECTURE.md`：§5.4 记忆数据流（混合检索 + 实时 embed + 回填）、§8 决策 +1 行、§9 模块映射（memoryService/embedding 辅助 + scripts）
- [x] 5.2 `API_CONTRACT.md`：记忆中心内部说明追加（embedding 不下发、无公共契约变更）
- [x] 5.3 `apps/api/.env.example`：登记 `EMBEDDING_API_KEY`/`EMBEDDING_MODEL`（仅占位，注释「可选；缺省回退 OPENAI_API_KEY；无 key 自动结构化降级」）
- [x] 5.4 `PROJECT_STATUS.md`：交付后 In Progress → Completed（含测试/验收基线）

## 6. 验证与归档

- [x] 6.1 三包 typecheck + api/shared/web 测试全绿；`openspec validate --all`
- [ ] 6.2 真机验收（默认无 key 回归全链路 + 配 key 后真实 embed 落库/相似召回/回填脚本幂等）→ 通过后 `openspec archive 2026-09-06-pgvector-vector-retrieval` + 移入 Completed Modules + Trellis journal
  - 已通过：默认无 key 回归全链路（对话注入命中原记忆、admin 列表正常、SSE 形状不变）+ 真库向量 SQL 冒烟（`memories_embedding_idx` 存在、cosine 查询零错误）+ 单测/mock 全绿。
  - 待负责人执行（本环境无真实 OpenAI key）：配置 `EMBEDDING_API_KEY` 后跑通真实 embed 落库 / 语义相似召回 / 回填脚本幂等；见 PROJECT_STATUS Risks。

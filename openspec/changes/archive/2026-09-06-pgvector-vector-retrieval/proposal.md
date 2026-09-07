# 2026-09-06-pgvector-vector-retrieval

## Why

记忆中心的召回自 FU-14/15 起只有**时间倒序**：`memoryService.searchMemories` 按 `createdAt` desc + `kind`/`keyword` 过滤 + `take 5`，同 profile 记忆一多，注入的未必是与当前话题最相关的 5 条，跨会话复用质量受限。ai-sdk 的 `embed()` 已实现（仅 OpenAI 供应商支持 `text-embedding-3-small`，DeepSeek/Claude 无 embeddings API），但 embedding 未生成、未存储、未使用。FU-14 一期因「Prisma 不支持 vector 列常规读写 + 需要支持 embed 的供应商」将 pgvector 明确推迟为单独一期；本期把它交付为**纯内部召回升级**。需求文档已批准（[docs/requirements/2026-09-06-pgvector-vector-retrieval.md](../../../docs/requirements/2026-09-06-pgvector-vector-retrieval.md)）。

## What Changes

- **数据库（packages/database）**：`Memory` 增加 `embedding Unsupported("vector(1536)")?`（可空）；迁移 `add_memory_embedding`：`CREATE EXTENSION IF NOT EXISTS vector;` + `ALTER TABLE memories ADD COLUMN embedding vector(1536);` + HNSW 索引（`USING hnsw (embedding vector_cosine_ops)`，Neon 原生支持）。既有结构化索引（`@@index([profileId, kind])`、`@@index([profileId, createdAt])`）保留。
- **ai-sdk（packages/ai-sdk）**：embed 客户端与聊天供应商**解耦**——新增可选 env `EMBEDDING_API_KEY`（缺省回退 `OPENAI_API_KEY`）、`EMBEDDING_MODEL`（默认 `text-embedding-3-small`，仅支持 1536 维）。未配置 key 时 embed 能力为「不可用」降级信号（非 typed missing-key 错误），`AI_PROVIDER=deepseek` 的默认 chat 链路不受影响。
- **后端（apps/api）**：
  - `memoryService.searchMemories` 升级为**混合检索**（签名与默认限量 5 不变，调用点 `stateLoop` 不改）：embed 可用且行有向量 → `$queryRaw` 按 cosine 距离升序取 top-N（`profileId` 必填 + 可选 `kind`/`keyword` 预过滤）；召回不足 `limit` 时按结构化（时间倒序）补齐；embed 不可用或全表无向量 → 走既有 `findMany` 路径（零行为变化）。写库前校验向量长度 = 1536，不符则该条降级结构化并记日志。
  - `addMemory`（FU-14 抽取旁路）与 FU-15 admin `createMemory` 共用同一写入链路：落库后若有 embed 客户端则生成向量并 raw `UPDATE` 写回；embed 失败只记日志、不抛错（保持「失败静默」约定），无 key 时全链路与现状一致。
  - 新增 embed 客户端组装（并入 `apps/api/src/memory/` 或复用现有 llmClient 扩展，实现细节见 design.md）。
- **脚本（Fairy/scripts）**：新增 `backfill-memory-embeddings.ts`（tsx 运行）——选 `embedding IS NULL` 的行批量 embed + raw UPDATE，幂等可重跑，单条失败不中断，结束打印统计；**CI 不跑真实 embed 调用**。
- **无破坏性变更**：embedding 列可空且**不下发**（admin `listMemories` 行形状不变）；SSE 事件与负载不变；公共 HTTP 契约零改动；既有结构化检索行为在未配置 embed 时完全保留。

## Capabilities

### Modified Capabilities

- `memory-center`: 检索从「时间倒序结构化」升级为「**向量相关度为主 + 结构化兜底补齐**」的混合检索（可选，配置 embed key 后生效）；新写入记忆在有 embed 客户端时实时生成 embedding，存量记忆可经幂等脚本回填；无 embed key / 故障 / 长度异常时自动降级结构化，对话不受影响。
- `ai-provider`: 在既有 `AI_PROVIDER` 聊天供应商选择之外，新增**独立可选 embed 配置**（`EMBEDDING_API_KEY`/`EMBEDDING_MODEL`），embed 能力可与聊天供应商解耦；缺 embed key 是降级信号而非错误。

## Impact

- `packages/database`：`Memory` 模型 + `add_memory_embedding` 迁移（含 vector 扩展与 HNSW 索引）。
- `packages/ai-sdk`：embed 客户端可选配置（env 读取、降级语义）＋测试。
- `apps/api`：`memory/memoryService.ts`（混合检索 + 实时 embed 写回）、embed 客户端/或 `agent/llmClient.ts` 扩展 + 测试；`stateLoop.ts` 调用点不变。
- `Fairy/scripts/backfill-memory-embeddings.ts`：新增回填脚本。
- 文档脊柱：`ARCHITECTURE.md`（§5.4 记忆数据流、§8 决策、§9 模块映射）、`API_CONTRACT.md`（内部说明，无公共契约变更）、`apps/api/.env.example`（`EMBEDDING_API_KEY`/`EMBEDDING_MODEL` 占位）、`PROJECT_STATUS.md`。

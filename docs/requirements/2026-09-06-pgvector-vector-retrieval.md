# 需求：FU-16 pgvector 记忆向量检索（记忆中心三期）

> 状态：**approved**（2026-09-06，用户批准，OpenSpec 轨；2026-09-06 交付并归档，提案见 [2026-09-06-pgvector-vector-retrieval](../../openspec/changes/archive/2026-09-06-pgvector-vector-retrieval/proposal.md)。注：配 key 后的真实 embed 端到端验收待负责人补跑，见 PROJECT_STATUS Risks）· 日期：2026-09-06 · 负责人：Flores
> 轨道：OpenSpec（跨 db + ai-sdk + api 服务层，改 `ARCHITECTURE.md` 数据流，新增环境变量；无公共 API 契约变更）
> 前置：FU-14 记忆中心一期（结构化记忆落库与检索注入）、FU-15 记忆管理面（admin REST + 管理页）均已交付归档。

## 背景 / 问题

1. **召回只有时间倒序，没有语义相关性**：FU-14/15 的记忆检索 `searchMemories` 按 `createdAt` 倒序 + `kind`/`keyword` 过滤 + `take 5`。同 profile 记忆一多，最近写入的 5 条未必是「与当前话题最相关」的 5 条，跨会话复用靠运气。
2. **embed 能力已具备但未接线**：ai-sdk 的 `embed()` 已实现且 OpenAI 供应商支持 `text-embedding-3-small`（DeepSeek/Claude 供应商无 embeddings API，直接抛错）。embedding 未生成、未存储、未使用。
3. **`Unsupported(vector)` 运维复杂度**：Prisma 不支持 vector 列的常规读写，需 raw SQL 迁移 + `$queryRaw`/`$executeRaw`，这是 FU-14 一期将其推迟到单独一期的主要原因。
4. **检索语义变更需防回归**：既有降级保证（无 key/故障时对话完全不受影响）与用户隔离（`profileId` 必填）是 AGENTS §6 / §15 级红线，升级后必须原样保留。

## 目标

- 为 `Memory` 增加 **embedding 列（vector(1536)）+ pgvector 索引**，把对话注入的召回从「时间倒序」升级为「**向量相关度为主**」。
- **混合检索 + 优雅降级**：配置了 embed key 时按向量相似度召回（`kind`/`keyword` 可作预过滤）；无 key、embed 故障或记忆缺向量时，自动退回现有结构化检索。**默认 dev 环境（DeepSeek、无 OpenAI key）行为与现状完全一致**。
- **存量记忆一次性幂等回填**，新记忆写入时实时生成 embedding；写入与回填走同一条 embed 链路。
- 纯**内部召回升级**：不新增公共 API 契约、不改 SSE 事件、不动 admin 管理 UI。对话注入条数仍 ≤5（上下文预算不变）。

## 范围（本期待办）

1. **Prisma schema + 迁移**：`Memory` 增加 `embedding Unsupported("vector(1536)")?`（可空——存量行合法）。迁移 `add_memory_embedding`：`CREATE EXTENSION IF NOT EXISTS vector;` + `ALTER TABLE memories ADD COLUMN embedding vector(1536);` + HNSW 索引（`USING hnsw (embedding vector_cosine_ops)`，Neon 原生支持）。
2. **ai-sdk embed 接线（供应商特化逻辑留在 SDK 包内，AGENTS §5）**：embed 客户端与聊天供应商**解耦**——即使 `AI_PROVIDER=deepseek` 也能 embed。新增可选 env：`EMBEDDING_API_KEY`（缺省回退 `OPENAI_API_KEY`）、`EMBEDDING_MODEL`（默认 `text-embedding-3-small`，仅支持 1536 维模型）。未配置 key 时 embed 客户端为 `null`（降级信号），不阻断启动、不参与 chat 流。
3. **`memoryService` 混合检索**：`searchMemories` 签名保持向后兼容（调用点 `stateLoop.ts` 不改）。实现为：
   - embed 可用且检索结果含向量 → `$queryRaw` 按 `embedding <=> $1`（cosine）升序取 top-N，`profileId` 必填 + 可选 `kind`/`keyword` 预过滤；
   - 召回不足 `limit` 时用结构化（时间倒序）补齐；
   - embed 不可用 / 整表无向量（回填前）→ 走既有 `findMany` 路径，零行为变化；
   - 写库前校验向量长度 = 1536，不符则本条降级结构化并记日志。
4. **写入链路实时 embed**：`addMemory`（FU-14 抽取旁路与 FU-15 admin 新增共用）落库后经 embed 客户端生成向量 → raw `UPDATE` 写回。embed 失败只记日志、不抛错（保持既有「失败静默」约定）；`metadata` 可记录 embed 模型与版本。
5. **一次性幂等回填脚本**：`Fairy/scripts/` 下新增 `backfill-memory-embeddings.ts`（tsx 运行）：选 `embedding IS NULL` 的行 → 批量 embed → raw UPDATE；可重跑、逐条失败不中断、结束打印统计。**不上真实 OpenAI 调用则 CI 不跑**（AGENTS §7：CI 禁止真实供应商调用）。
6. **测试**：
   - `memoryService`：mock embed（确定性向量，禁真实 API）覆盖——向量排序优先于时间倒序、`kind`/`keyword` 预过滤、召回不足补齐、无 key 全结构化、用户隔离不破、注入 ≤ limit、长度≠1536 降级；
   - ai-sdk：embed 客户端缺 key 返回 null / openai 路径（fetch mock）；
   - 既有 chat/contextBuilder/memoryService 用例全绿；三包 typecheck。
7. **文档**：`ARCHITECTURE.md`（§5.4 记忆数据流 + §8 决策表 + §9 模块映射）、`API_CONTRACT.md`（内部说明，无公共契约变更）、`apps/api/.env.example`（登记 `EMBEDDING_API_KEY`/`EMBEDDING_MODEL`，仅占位值）、`PROJECT_STATUS.md`（交付后移入 Completed）。

## 非目标

- 不改公共 API 契约：`GET/POST /api/memories` 等行形状不变（embedding 列**不下发**）；SSE 事件名与负载不变。
- 不改 admin 管理页（`/admin/memories`）；不做「向量相关度/相似记忆」展示。
- 不做用户自查入口（铃查看记忆），维持 admin-only 现状。
- 不做画像反向回写、不做跨用户记忆共享（AGENTS §6 红线不变）。
- 不引入 DeepSeek/Claude embed（供应商无此能力）；不换聊天供应商。
- 不做关键词向量化、同义/多语言召回增强。

## 受影响模块

| 模块 | 改动 |
|---|---|
| `packages/database` | `Memory` 加 `embedding Unsupported("vector(1536)")?` + `add_memory_embedding` 迁移（CREATE EXTENSION + 列 + HNSW 索引） |
| `packages/ai-sdk` | embed 客户端可选配置与供应商解耦（`EMBEDDING_API_KEY`/`EMBEDDING_MODEL`，缺 key → null） |
| `apps/api/src/memory/memoryService.ts` | `searchMemories` 混合检索（向量为主 + 结构化兜底/补齐）；`addMemory`/`createMemory` 落库后实时 embed（失败静默） |
| `apps/api/src/memory/`（新 `embeddingClient` 或并入现有 llmClient） | embed 客户端组装与降级 |
| `Fairy/scripts/backfill-memory-embeddings.ts`（新） | 存量记忆幂等回填 |
| 文档 | `ARCHITECTURE.md`、`API_CONTRACT.md`（内部说明）、`apps/api/.env.example`、`PROJECT_STATUS.md` |

## 验收标准（草案，OpenSpec 阶段细化）

- AC-1：迁移后 `memories.embedding` 为可空 `vector(1536)`，HNSW 索引存在；Neon（dev/fairy_test）`CREATE EXTENSION` 成功；`pnpm --filter=@fairy/database migrate:status` 同步。
- AC-2：默认 dev（无 `EMBEDDING_API_KEY`）全链路零变化——对话注入仍 ≤5 条结构化结果，SSE 形状不变，无报错、无新增必需 env。
- AC-3：配置 embed key（或 mock）后，写入的记忆实时生成向量；同 profile 下与当前话题语义相近的记忆优先于更新的无关记忆被召回。
- AC-4：用户隔离与过滤不破——A 用户记忆不进 B 用户 prompt；`kind`/`keyword` 预过滤在向量路径生效。
- AC-5：回填脚本幂等：仅补齐 `embedding IS NULL` 行，二次运行不重复调用 embed、不报错；embed 单条失败不影响其余。
- AC-6：向量长度 ≠ 1536（如误配非 1536 维模型）时不写坏库，该条降级结构化并记日志。
- AC-7：测试全绿：api（新增 memory 混合检索用例，CI mock embed、不调真实 API）+ shared + web 三包 typecheck；`openspec validate --all` 通过。
- AC-8：真机：admin 补录与对话抽取落库均带向量（有 key 时）；全新会话问「喜欢什么片型」仍能引用记忆（回归 AC-3 FU-14）。

## 待决问题（grill-me 已拍板 2026-09-06）

1. **检索策略**：✅ 已拍板——混合：向量为主 + 结构化兜底/补齐；注入 ≤5 不变。
2. **embed 供应商接入**：✅ 已拍板——独立可选配置（`EMBEDDING_API_KEY`，缺省回退 `OPENAI_API_KEY`；`EMBEDDING_MODEL` 默认 `text-embedding-3-small`），与聊天供应商解耦；缺 key 自动降级结构化。
3. **存量回填**：✅ 已拍板——一次性幂等回填脚本（`Fairy/scripts/`），上线后跑一次；新记忆实时生成。
4. **本期范围**：✅ 已拍板——纯内部召回升级；无公共 API / UI / 管理面改动；无用户自查入口。

### 技术风险（OpenSpec 阶段细化）

- **Prisma `Unsupported` 列**：`Memory` 常规 create/find 不会读写 embedding，向量写入与检索必须走 raw SQL；`listMemories`（FU-15）与既有测试不受影响。
- **HNSW 索引构建**：存量行无向量（NULL）不参与索引；回填后再构建或直接建索引均可（Neon 支持），OpenSpec 设计定。
- **维度一致性**：embedding 列固定 1536 维；若日后换更高维模型需新迁移，本期不做。
- **fairy_test 需 pgvector**：测试库同样会执行含 `CREATE EXTENSION` 的迁移；Neon 原生支持，若某日测试迁到未装 pgvector 的本地 PG 会失败——登记为环境前提。

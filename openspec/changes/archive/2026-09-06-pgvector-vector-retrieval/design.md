# Design: 2026-09-06-pgvector-vector-retrieval

## Context

现状核对（2026-09-06）：

- `memoryService.searchMemories(profileId, { kind?, keyword?, limit? })` = `prisma.memory.findMany`（`where profileId + kind + content contains`，`orderBy createdAt desc`，`take limit??5`）。唯一生产调用点 `agent/stateLoop.ts`：`searchMemories(profile.userId)`（无 options，默认 5），结果进 `context.memories` → `responseSynthesizer.buildMemoryBlock`。`chat.test` 整模块 mock `memoryService`；`memoryService.test` 直连测试库（fairy_test，Neon）。
- `addMemory` 被两处复用：FU-14 每轮抽取旁路、FU-15 admin `createMemory`。embedding 写回加在这一个入口即可覆盖两条链路。
- ai-sdk：`factory` 按 `AI_PROVIDER` rawName 建 provider，`embeddingsSupported` 仅 openai；`embed()` 默认模型 `text-embedding-3-small`；claude/deepseek 的 `embed()` 抛 typed unsupported。因此「embed 与聊天供应商解耦」= 在 ai-sdk 加一个**不受 `AI_PROVIDER` 约束**的 embed 客户端创建入口。
- DB 为 Neon（`packages/database/.env` 与 `apps/api/.env` 一致），pgvector 原生支持；`fairy_test` 同库 → 迁移里 `CREATE EXTENSION IF NOT EXISTS vector` 对 dev/test 均有效（若某日测试迁到未装 pgvector 的本地 PG 会失败——登记为环境前提）。

## Goals / Non-Goals

**Goals:**
- `Memory` 增加可空 `embedding vector(1536)` + HNSW（cosine）索引；写入链路实时 embed、存量可幂等回填。
- `searchMemories` 混合检索：向量相关度为主（`kind`/`keyword` 可预过滤），结构化兜底补齐；注入 ≤5 与签名不变。
- 默认 dev（无 embed key）行为与现状完全一致；embed 故障/长度异常静默降级；CI 只跑 mock、不调真实 embed API。
- 纯内部召回升级：无公共 API/UI/管理面改动。

**Non-Goals:**
- 不改管理页/REST 行形状；不做用户自查；不做画像回写；不做跨用户共享。
- 不换聊天供应商、不给 DeepSeek/Claude 加 embed；不引入非 1536 维模型（换维度需新迁移）。
- 不做 keyword 向量化/同义召回。

## Decisions

1. **混合检索算法（用户已拍板「向量为主 + 结构化兜底」）**
   单函数内两步，保持 `searchMemories` 对外签名与「≤limit」语义：
   - 有 embed 客户端时先走向量：`SELECT id, profileId, sessionId, kind, content, metadata, "createdAt" FROM memories WHERE "profileId"=$1 [AND kind=$2] [AND content LIKE ...] AND embedding IS NOT NULL ORDER BY embedding <=> $vec LIMIT $limit`（cosine 升序；`profileId` 永远必填保隔离）。
   - 返回不足 `limit` 时补齐：对缺额按既有结构化路径（排除已返回 id）取 `createdAt desc` 补足，保证注入总数 ≤ limit 且「旧记忆也有机会」。
   - 无 embed 客户端 / 表无向量：直接走既有 `findMany`，零行为变化。
   调用点 `stateLoop` 不感知（不传 query 向量参数——query 嵌入在 service 内部根据注入预算做，不新增上下文参数；语义相关问题见 Decision 6）。

2. **embed 客户端独立配置（用户已拍板）**
   ai-sdk 暴露 `createEmbeddingClient(env)` 之类入口：读 `EMBEDDING_API_KEY`（缺省回退 `OPENAI_API_KEY`）、`EMBEDDING_MODEL`（默认 `text-embedding-3-small`）；无 key → 返回 `null`（降级信号），不抛 typed missing-key。供应商特化（请求构造、错误分类）继续只在 ai-sdk 内。聊天 provider（deepseek）不受影响。`apps/api` 侧组装一次 embed 客户端并 memoize，供写入/回填/检索共用。

3. **1536 维守卫**
   写入/回填对 embed 结果做 `length === 1536` 校验；不符记日志并跳过该条向量写回（该记忆保留为结构化可召回），绝不写坏列。

4. **写入链路：落库后再 embed 写回**
   `addMemory`（= 抽取旁路与 admin 共用的唯一入口）保持原 `prisma.memory.create` 语义，成功后若有 embed 客户端则生成向量并经 raw `UPDATE memories SET embedding=$1::vector WHERE id=$2` 写回；失败 catch 记日志。不把 embed 放进 create 事务——embed 是外部调用，耦合会放大失败面；先落库保证记忆本身不丢，向量后续可由回填脚本补。

5. **回填脚本幂等**
   `Fairy/scripts/backfill-memory-embeddings.ts`（tsx 运行，连 `@fairy/database` prisma + 同一 embed 客户端）：`WHERE embedding IS NULL` 分批（如 50 条/批）→ embed → raw UPDATE；逐条失败 catch 继续；结束打印成功/失败/跳过统计；无 key 时打印提示并正常退出。只该「无向量」行 → 天然幂等，可重跑。

6. **query 的嵌入来源（实现期定稿）**
   本期向量检索的 query 向量由 embed 客户端对「当前轮用户消息 + 注入预算语义」编码。为把外部调用面压到最小，先在 `stateLoop` 现有调用形态下评估：若直接改 `searchMemories` 签名侵入面大，则在 service 内提供 `searchMemoriesByQuery(profileId, queryText, options)`（内部用），`searchMemories` 委托之并把 queryText 置空退化为结构化。实现期以测试可 mock、行为可确定为准，不扩大公共面。

7. **测试策略（AGENTS §7：CI 禁真实供应商调用）**
   - embed 客户端与 query 编码在测试中 `vi.mock`（确定性伪向量），永不打真实 API。
   - 混合检索的「排序/补齐/预过滤/隔离/≤limit/1536 守卫/无 key 降级」用测试库真行 + raw 插入 1536 维伪向量断言（fairy_test 已具备 pgvector）。
   - ai-sdk 侧用 factory 既有 `fetchImpl` mock 覆盖 openai embed 请求；deepseek/claude `embed()` typed unsupported 与「缺 key → null」各一条。
   - 既有 chat/contextBuilder/memoryService 用例保持绿（签名不变、降级路径零行为变化）。

8. **无公共契约变更**
   `embedding` 列可空且永不下发：admin `listMemories` 的 select/DTO 不含该列；SSE/HTTP 契约零改动。文档侧仅 ARCHITECTURE/API_CONTRACT（内部说明）/`.env.example`/PROJECT_STATUS 更新。

## 风险

- Prisma `Unsupported("vector(1536)")?`：常规 client 不读写该列，向量写/读全部 raw SQL；迁移后需 `generate`。若未来 schema 迁移对 vector 列做非 raw 操作会报错——约束由代码注释与文档声明。
- Neon shadow DB 执行 `CREATE EXTENSION`：Neon 支持，无碍；本地 PG 未装 pgvector 时 migrate 会失败（登记环境前提，dev 现为 Neon）。
- HNSW 索引在列可空 + 回填前全 NULL 时无收益但合法；回填完成后生效。数据量小，构建成本可忽略。

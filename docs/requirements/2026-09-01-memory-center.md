# 需求：Memory-Center 记忆中心（第一期：结构化记忆落库与检索注入）

> 状态：**implemented**（2026-09-01，用户批准，OpenSpec 轨；2026-09-06 交付并归档）· 日期：2026-09-01 · 负责人：Flores
> 轨道：OpenSpec（提案已归档，见 `openspec/changes/archive/2026-09-01-memory-center/`）· 关联技术债：`TODO(memory-center)`（`apps/api/src/agent/contextBuilder.ts`，FU-14 已替换完成）。

## 背景 / 问题

1. **对话历史注入是临时旁路**：`contextBuilder.buildConversationHistory` 把最近 10 条会话原文拼成纯文本注入 prompt（`TODO(memory-center)`）。它既无跨会话记忆（换新会话即丢失），也无相关性排序（只是时间倒序），无法支撑长期上下文。
2. **跨会话偏好/事实无法复用**：铃在第一会话说过「我喜欢科幻片」，第二会话问「我喜欢什么类型的片子」时 Fairy 答不上来（画像里没有、历史也不在）。
3. **ai-sdk `embed()` 已存在但未使用**（OpenAI 供应商支持 `text-embedding-3-small`；DeepSeek 供应商不支持 embed）。AGENTS §6 允许「仅用于 embedding 检索时才使用向量扩展」，非必须。

## 目标

- 建立**结构化记忆存储**（PostgreSQL）：对话中值得记住的要点（偏好、事实、意图）落库，关联 `profileId`（可选 `sessionId`），支撑跨会话复用。
- 用**记忆中心统一检索与注入**：替换 `TODO(memory-center)` 纯文本旁路；注入按用户隔离（仅本 `profileId`）、按 kind/时间/关键词检索并限量。
- **降级友好**：LLM 抽取失败、embed 不可用（无 OpenAI key）、DB 异常时，对话功能完全不受影响（不崩、不漏、不阻塞）。

## 范围（第一期）

1. **Prisma `Memory` 模型 + 迁移**：`id`、`profileId`（必填）、`sessionId`（可空）、`kind`（枚举：`preference` 偏好 / `fact` 事实 / `intent` 意图）、`content`（文本）、`metadata`（Json，可空）、`createdAt`；索引 `@@index([profileId, kind])`、`@@index([profileId, createdAt])`。
2. **`apps/api/src/memory/` 模块（新建）**：
   - `memoryService`：`addMemory`（落库）、`searchMemories`（按 `profileId` + `kind` 过滤 + 时间倒序 + 关键词包含匹配，限量 N 条，默认 5）；
   - `memoryExtractor`：LLM 从一轮对话抽取 `{ memories: [{ kind, content }] }` 结构化 JSON（低温度、失败返回空数组静默跳过）。
3. **chat 链路接入**：
   - 对话完成后（SSE 之后旁路）：抽取 → `addMemory`（失败不中断响应）；
   - 下一轮组装 prompt 时：`memoryService.searchMemories(profileId)` 结果注入，替换 `buildConversationHistory` 旁路（近期会话历史仍由 `sessionService` 提供，两段共存，标记后续统一）。
4. **shared**：`memorySchemas`（`memoryKindSchema`、抽取结果 schema）或最小内部类型（若一期无新 REST 端点，则以内部类型为准，不新增公共契约）。
5. **测试**：`memoryService`（增删查、用户隔离、限量）、`memoryExtractor`（抽取成功/失败降级）、chat 链路注入（跨会话复用）、无 OpenAI key 降级路径。
6. **文档**：ARCHITECTURE 新增记忆中心模块边界与数据流；PROJECT_STATUS 移除 `TODO(memory-center)` 技术债登记（或改为完成）；无公共 API 变更则 API_CONTRACT 仅加内部说明。

## 非目标（第一期）

- 记忆管理 UI（admin 查看/编辑/删除记忆）→ 二期候选。
- REST 记忆端点（`GET/POST /api/memories`）→ 二期候选（届时走 OpenSpec 加公共契约）。
- **pgvector 原生向量检索** → 二期候选；一期用结构化检索（kind/时间/关键词），embedding 不生成、不存储，避免引入 Unsupported(vector) 的 Prisma/Neon 运维复杂度。
- 从记忆自动回写画像偏好（反向同步）→ 二期候选。
- 跨用户记忆共享 → 明确不做（AGENTS §6：记忆必须关联 `profileId`，用户隔离）。

## 受影响模块

| 模块 | 改动 |
|---|---|
| `packages/database` | `Memory` 模型 + 迁移 |
| `packages/shared` | `memorySchemas`（若走内部类型则仅导出类型） |
| `apps/api/src/memory/` | 新目录：`memoryService` + `memoryExtractor` |
| `apps/api/src/agent/` | `contextBuilder` 改造（记忆注入）、`stateLoop`/chat 链路接线 |
| `apps/api/src/agent/llmClient.ts` | 新增 `agent.memory` 抽取调用（复用 `tryChat`） |
| 文档 | ARCHITECTURE / PROJECT_STATUS（API_CONTRACT 视情况） |

## 验收标准（草案）

- AC-1：一轮对话完成后（抽取成功时）DB 新增 `Memory` 行，关联正确 `profileId`，`kind`/`content` 合理。
- AC-2：抽取失败或 LLM 不可用时**静默跳过**，对话响应完整、无错误泄漏；SSE `done` 正常。
- AC-3：同一 `profileId` 新会话（新 `sessionId`）注入上一会话的记忆——「我喜欢科幻片」后开新会话问「我喜欢什么类型的片子」，Fairy 能答出「科幻」。
- AC-4：记忆检索严格按 `profileId` 隔离：A 用户的记忆不会注入到 B 用户的 prompt。
- AC-5：`buildConversationHistory` 纯文本旁路被替换：注入内容由记忆中心检索结果构成（近期会话历史可共存，注释说明二期统一）。
- AC-6：无 OpenAI key（embed 不可用）时全链路正常（一期不依赖 embed）。
- AC-7：api 测试全绿（新增 memory 相关用例）+ 三包 typecheck + `openspec validate --all`（若有 spec 变更）。

## 待决问题（已拍板 2026-09-01）

1. **抽取范围**：✅ 已拍板——每轮对话都 LLM 抽取一次（失败静默跳过），行为更自然。
2. **注入组成**：✅ 已拍板——「记忆检索 ≤5 条 + 近期会话历史（现状 10 条）共存」；近期会话历史一期不并入记忆中心。
3. **轨道**：✅ 已拍板——走 OpenSpec 轨（propose → approve → apply → archive）。

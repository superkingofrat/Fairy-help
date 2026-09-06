## Why

跨会话记忆自 Phase 2 起挂账：`contextBuilder.buildConversationHistory` 以 `TODO(memory-center)` 临时旁路把最近 10 条会话原文拼成纯文本注入 prompt——换新会话即丢失，无相关性排序，无法支撑长期上下文；铃在会话 A 说「我喜欢科幻片」，会话 B 问「我喜欢什么类型的片子」时 Fairy 答不上来。ai-sdk `embed()` 已存在但未使用（仅 OpenAI 供应商支持）。需求文档已批准（[docs/requirements/2026-09-01-memory-center.md](../../docs/requirements/2026-09-01-memory-center.md)）。本期交付**第一期：结构化记忆落库 + 检索注入**；管理 UI、REST 记忆端点、pgvector 向量检索、画像反向回写为二期非目标。

## What Changes

- **数据库（packages/database）**：新增 `Memory` 模型（`id`、`profileId` 必填、`sessionId` 可空、`kind` 枚举 `preference|fact|intent`、`content`、`metadata` Json?、`createdAt`）+ 迁移；复合索引 `@@index([profileId, kind])`、`@@index([profileId, createdAt])`。
- **共享（packages/shared）**：新增 `memorySchemas.ts`（`memoryKindSchema`、`memoryRecord`/`memoryExtraction` 内部类型或 schema）+ 测试；**无新 REST 端点，不扩展公共 HTTP 契约**（`chatEventSchema` 不变）。
- **后端（apps/api）**：
  - 新目录 `memory/`：`memoryService`（`addMemory` 落库、`searchMemories` 按 `profileId`+`kind` 过滤 + 时间倒序 + 关键词包含匹配，限量 N 条默认 5）+ `memoryExtractor`（LLM 从一轮对话抽取 `{ memories: [{ kind, content }] }`，`tryChat("agent.memory")` 新 source，低温度、schema 校验失败返回空数组静默跳过）。
  - agent 链：`contextBuilder` 用 `searchMemories(profileId)` 结果注入【记忆】区块（≤5 条），替换 `TODO(memory-center)` 纯文本旁路（近期会话历史仍由 `sessionService` 提供，两段共存，注释说明二期统一）；`stateLoop`/chat 路由在 SSE 完成后旁路调 `memoryExtractor` → `addMemory`（失败不中断响应）；无 OpenAI key（embed 不可用）时全链路不受影响。
- **文档**：`ARCHITECTURE.md`（新增记忆中心模块边界与数据流）、`PROJECT_STATUS.md`（移除技术债登记、记完成）。
- **无破坏性变更**：Prisma 新模型 + 迁移为追加式；prompt 注入变化不改变 SSE 事件形状；`chatEventSchema`、`BehaviorAction`、HTTP 契约均不变。

## Capabilities

### New Capabilities

- `memory-center`: 结构化记忆中心——每轮对话完成后 LLM 抽取值得记住的偏好/事实/意图并按 `profileId` 落库（`sessionId` 可空）；下一轮 prompt 组装时按用户隔离检索 ≤5 条注入，替换纯文本历史旁路，支撑跨会话复用；抽取失败、LLM/embed 不可用时静默降级，对话功能不受影响。

### Modified Capabilities

- `agent-chat`: prompt 上下文在近期会话历史之外注入用户记忆（检索结果 ≤5 条）；SSE 事件形状与既有事件不变，仅内部上下文组装变化。

## Impact

- `packages/shared`：`memorySchemas.ts` 新增 + `index.ts` 导出 + `memorySchemas.test.ts`。
- `packages/database`：`Memory` 模型 + `add_memory_model` 迁移。
- `apps/api`：`memory/memoryService.ts`、`memory/memoryExtractor.ts`、`agent/contextBuilder.ts` 改造、`agent/stateLoop.ts`/`routes/chat.ts` 接线、`agent/llmClient.ts` 新 source + 测试（memoryService / memoryExtractor / contextBuilder / chat 链路）。
- 文档脊柱：`ARCHITECTURE.md`、`PROJECT_STATUS.md`（API_CONTRACT 无公共变更，仅内部说明）。

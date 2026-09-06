## 1. 数据库

- [x] 1.1 `schema.prisma`：新增 `MemoryKind` 枚举（`preference`/`fact`/`intent`）+ `Memory` 模型（`id`、`profileId`、`sessionId`?、`kind`、`content`、`metadata` Json?、`createdAt`、`@@index([profileId, kind])`、`@@index([profileId, createdAt])`）
- [x] 1.2 生成迁移 `add_memory_model` 并 `migrate:dev` + `generate`

## 2. Shared 契约

- [x] 2.1 新增 `packages/shared/src/schemas/memorySchemas.ts`：`memoryKindSchema`/`memoryRecordSchema`/`memoryExtractionSchema` + 类型
- [x] 2.2 经 `schemas/index.ts` 与 `src/index.ts` 导出（内部类型，无新 REST 契约）
- [x] 2.3 新增 `memorySchemas.test.ts`：形状与 kind 枚举断言
- [x] 2.4 `pnpm --filter=@fairy/shared build` + typecheck（供 api 消费）

## 3. API：memory 模块

- [x] 3.1 新增 `memory/memoryService.ts`：`addMemory`（按 `profileId` 落库，失败不抛出到对话层）+ `searchMemories`（`profileId` 必填 + 可选 `kind` + `createdAt` 倒序 + `content` 包含匹配，限量 N 默认 5）
- [x] 3.2 新增 `memory/memoryExtractor.ts`：`extractMemories(userMessage, replyText)` → LLM 结构化 JSON `{ memories: [{ kind, content }] }`（`tryChat("agent.memory")` 新 source，低 temperature，失败/校验失败返回空数组静默跳过）
- [x] 3.3 新增 `__tests__/memoryService.test.ts`（增/查/用户隔离/限量/关键词）与 `memoryExtractor.test.ts`（成功/非法 JSON/LLM 失败静默）

## 4. API：agent 链接入

- [x] 4.1 `agent/llmClient.ts`：`agent.memory` source（复用 `tryChat` 机制）
- [x] 4.2 `agent/contextBuilder.ts`：`searchMemories(profileId)` 结果注入【记忆】区块（≤5 条），替换 `TODO(memory-center)` 纯文本旁路；近期会话历史共存，注释说明二期统一；无记忆时干净省略
- [x] 4.3 `routes/chat.ts`：SSE 发完 `done` 后旁路 `extractMemories` → `addMemory`（`void` + catch，失败不影响响应）
- [x] 4.4 `agent/stateLoop.ts`：profile 已透传，确认 contextBuilder 注入记忆所需参数（profileId）
- [x] 4.5 测试：`contextBuilder.test.ts`（记忆注入 + 无记忆干净 + 用户隔离）、`chat.test.ts`（抽取旁路 + 跨会话复用 + 无 OpenAI key 降级）

## 5. 文档与验证

- [x] 5.1 `ARCHITECTURE.md`：新增记忆中心模块边界与数据流（§5.x 或 §8 决策 +1 行）
- [x] 5.2 `PROJECT_STATUS.md`：In Progress 更新 + 移除 `TODO(memory-center)` 技术债登记（或改为完成）
- [x] 5.3 `API_CONTRACT.md`：内部说明（无公共变更）
- [x] 5.4 验证：三包 typecheck + api/shared 测试全绿 + `openspec validate --all`
- [x] 5.5 真机验收 AC-1~AC-7 全部通过：AC-1（真实 LLM 抽取 → 新 Memory 行落库，session=yes）、AC-3（全新会话询问 → 回复引用记忆中「科幻片/太空题材」）、AC-2/AC-4/AC-5/AC-6/AC-7 此前已过（deepseek 余额恢复后补验 AC-1/AC-3 完成）
- [x] 5.6 归档：`openspec archive` → sync 主 spec → move change 至 archive → validate → journal → 提交

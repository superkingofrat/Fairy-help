## Why

FU-14/15/16（记忆中心一二三期，已归档）让记忆持续写入 `Memory` 表并被服务端注入对话 prompt、供 admin 经管理面查看，但**记忆的当事人——聊天用户（如铃）没有任何入口自查**：Fairy 说出「你最喜欢科幻片」时，用户无法核对 Fairy 记住了自己什么、无法知道某条记忆是对话时自己说过的（对话抽取）还是店员录入的。记忆对本人不透明。需求文档已批准（[docs/requirements/2026-09-07-memory-self-inspection.md](../../docs/requirements/2026-09-07-memory-self-inspection.md)）。本期交付 **FU-17：会话页「Fairy 记住了什么」只读自查面板**——任意已登录用户在聊天页即可查看**本人**记忆（时间倒序、带 kind 标签与来源标注）；admin 管理面保持不变；用户不可增删改（改删/遗忘权明确推后）。

## What Changes

- **共享（packages/shared）**：`memorySchemas.ts` 增加自查 schema——`memorySelfQuerySchema`（page/limit/kind/keyword，**无 userId/email**）与 `memorySelfListItemSchema`（`{ id, kind, content, sessionId?, createdAt }`，管理面列表项剔除 `email/userId` 的同构子集）+ 类型 + 测试。
- **后端（apps/api）**：
  - `memory/memoryService` 增加 `listOwnMemories(profileId, query)`：`where profileId = 本人` + 可选 `kind`/`keyword`（content 包含），`createdAt` 倒序分页 + `total`，**不做** Profile→User join、不下发 email。
  - `routes/memories.ts` 增加 `GET /me`（`authMiddleware`，任意已登录角色；仅置于 `/` 之后，无 `GET /:id` 冲突）；`memoryController` 增薄 handler；`app.ts` 挂载路径不变（同一 `/api/memories` router）。客户端传 `userId`/`email` 等参数被 schema 拒绝/忽略，身份一律以 `res.locals.userId` 为准。
- **前端（apps/web）**：`lib/memoryApi` 增 `listMyMemories`；`components/chat/` 新增 `MemorySelfPanel`（只读列表：kind 中文标签 + 内容 + 时间 + 来源标注，来源按 `sessionId` 有无推断「对话抽取 / 系统录入」；加载/错误/空态；展开/收起）；`ChatPage` 加入口按钮；文案走 `locales/zh-CN.json`。
- **文档**：`API_CONTRACT.md` §3.14 增 `GET /api/memories/me` 子节（401/200、本人隔离、参数忽略规则）；`ARCHITECTURE.md` §5.4 自查数据流 + §8 决策行；`PROJECT_STATUS.md`（完成后移入 Completed）。
- **无破坏性变更**：无 DB 迁移（复用 `Memory` 表与索引）；admin 管理面端点/行为不变；FU-14/16 抽取注入与 SSE 协议不变；embedding 仍永不下发。

## Capabilities

### Modified Capabilities

- `memory-management`: 在既有「admin 管理面」之外，新增**用户本人只读自查**：任意已登录用户经 `GET /api/memories/me` 查看自己的记忆（分页/kind/keyword 过滤、`createdAt` 倒序），会话页提供「Fairy 记住了什么」面板呈现（kind 标签 + 来源标注）；严格本人隔离（他人数据、email 不下发）；用户不可增删改。

## Impact

- 公共契约新增 1 个**任意已登录角色**的 REST 端点 `GET /api/memories/me`（新增 schema 经 `packages/shared` 共享）；admin-only 端点与 SSE 协议不变。
- 数据库无变更。
- 测试：shared schema 单测；api（`listOwnMemories` 隔离/过滤/分页 + `/me` 路由鉴权 401/200 + 忽略越权参数）；web（`MemorySelfPanel` 渲染/来源标注/空态 + `ChatPage` 入口）。
- 真机验收覆盖：user（铃）与 admin 各自自查只见本人记忆；来源标注正确（对话抽取 vs 系统录入）；admin 管理面回归不变。

## Why

FU-14（记忆中心第一期，已归档）让 Fairy 每轮对话都在后台向 `Memory` 表写入抽取记忆，但**没有任何界面或接口能查看「记住了什么」**：admin（绳匠）无法审计 Fairy 记住了哪些用户偏好，也无法纠错——模型一旦抽取了错误或过期的偏好，没有任何修正手段，还会持续注入后续回复。同时缺少人工补录入口（真机验收依赖预插 DB 行）。需求文档已批准（[docs/requirements/2026-09-06-memory-center-management.md](../../docs/requirements/2026-09-06-memory-center-management.md)）。本期交付 **FU-15：记忆管理面**——admin-only 的 `Memory` REST 端点 + `/admin/memories` 管理页；pgvector/embedding 向量检索与画像反向回写明确推后单独一期，用户侧自查入口不在本期。

## What Changes

- **共享（packages/shared）**：`memorySchemas.ts` 扩展管理面 schema——`memoryQuerySchema`（page/limit/userId/kind/keyword）、`memoryListItemSchema`（含 `userId/email`）、`memoryCreateSchema`、`memoryUpdateSchema`（kind/content 至少一项）+ 类型 + 测试。
- **后端（apps/api）**：
  - `memory/memoryService` 增加 `listMemories(query)`（admin 全量查询：join Profile→User 带 `email`、按 `userId`/`kind`/关键词包含过滤、`createdAt` 倒序、分页 + `total`）+ `createMemory`（校验 Profile 存在，复用与 `addMemory` 相同的落库路径）+ `updateMemory` + `deleteMemory`（复用既有 kind 枚举映射，删行幂等 404）。
  - 新增 `routes/memories.ts`：`GET /api/memories`、`POST /api/memories`、`PATCH /api/memories/:id`、`DELETE /api/memories/:id`，四个端点全部 `requireRole("admin")`（非 admin 403 `MEMORY_FORBIDDEN`）；controller 薄封装、`validateQuery`/`validateBody` 用共享 schema、统一 `{code,data,msg}` envelope；`app.ts` 挂载。
- **前端（apps/web）**：`api/memoryApi.ts`；`/admin/memories` 管理页（`RequireAuth role="admin"`）：列表（用户/kind/content/时间）+ 筛选（kind/关键词/用户）+ 分页 + 新增/编辑/删除（删除需确认）+ 加载/错误/空态 + zh-CN i18n + 管理导航入口。
- **文档**：`API_CONTRACT.md`（四个新端点 + 请求/响应形状与错误码表）、`ARCHITECTURE.md`（模块与数据流 + §8 决策行）、`PROJECT_STATUS.md`（完成后移入 Completed）。
- **无破坏性变更**：无数据库迁移（`Memory` 表与索引已满足）；FU-14 抽取/注入链路与 SSE 协议不变；管理面写入的行与 LLM 抽取行同表同检索路径。

## Capabilities

### New Capabilities

- `memory-management`: 记忆管理面——admin 可通过 REST 端点分页查看（按用户/kind/关键词过滤）、手动新增、编辑（kind/content）与删除各用户的 `Memory` 记录，并在 `/admin/memories` 管理页完成同样的操作；管理 REST 不依赖 LLM/embedding；admin 写入的行与 FU-14 LLM 抽取行同表存储、被同一检索注入路径消费。

## Impact

- 公共契约新增 4 个 admin-only REST 端点（新增 schema 经 `packages/shared` 共享），既有端点与 SSE 协议不变。
- 数据库无变更；`Memory` 行可被 admin 硬删（无外键引用）。
- 测试：shared schema 单测、api（memoryService 增查改删 + memories routes 权限/错误码）、web（AdminMemoryPage + memoryApi）。
- 真机验收覆盖：admin 增删改查 + 非 admin 403 + 管理页浏览器 E2E + 管理写入行在新会话被注入（回归 FU-14 AC-3）。

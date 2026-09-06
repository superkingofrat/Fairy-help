# 需求：Memory-Center 二期——记忆管理面（admin REST 记忆端点 + 管理页）

> 状态：**approved**（2026-09-06，用户批准，OpenSpec 轨）· 日期：2026-09-06 · 负责人：Flores · 编号：FU-15
> 前置：FU-14 已交付（`Memory` 模型 + 每轮 LLM 抽取落库 + 检索注入，见 [2026-09-01-memory-center.md](./2026-09-01-memory-center.md)）。

## 背景 / 问题

1. **记忆不可见、不可管**：FU-14 后 Fairy 每轮对话都在后台往 `Memory` 表写记忆，但没有任何界面或接口能查看「记住了什么」——admin（绳匠）无法审计、纠错（改错/删垃圾），用户画像/客服场景无法核对其正确性。信任风险：一旦模型抽取了错误或过期的偏好，没有任何修正手段，会持续注入后续回复。
2. **缺少人工补录入口**：真机验收靠预插 DB 行才能验证跨会话复用；运营想主动录入一条用户偏好（如「铃 喜欢太空题材」）也没有接口，只能直接改库。
3. **管理面参照物齐全**：FU-1 `/api/profiles` admin CRUD、FU-3 `/api/behavior-logs` 分页筛选列表、FU-11 `/admin/*` 管理页均有成熟约定（`RequireAuth role=admin`、统一 `{code,data,msg}`、controller 薄路由、shared Zod schema 共享、i18n）。本期是沿既有模式补齐记忆的 admin 管理面，无新技术风险。

## 目标

- 新增 **admin-only** 的 `Memory` REST 端点：分页列表（按用户/kind/关键词过滤 + 总条数）、手动新增、编辑（kind/content）、删除（硬删）。
- 新增 **admin 记忆管理页** `/admin/memories`：列表 + 筛选 + 分页 + 新增/编辑/删除交互，加载/错误/空态齐全，中文 i18n。
- 手动写入的记忆与 FU-14 LLM 抽取的记忆**同库同链路**：一经落库即被既有 `searchMemories` 检索、被下一轮对话注入。

## 范围

- REST：`GET /api/memories`（admin 分页列表）、`POST /api/memories`（admin 手动新增）、`PATCH /api/memories/:id`（admin 编辑 kind/content）、`DELETE /api/memories/:id`（admin 删除）。
- Web：`/admin/memories` 管理页 + 导航入口 + `memoryApi` 客户端 + i18n。
- Shared：新增记忆管理相关 schema（列表查询/列表项/新增/更新 + 类型）+ 测试。
- DB：预期**无需新迁移**（`Memory` 表与 `@@index([profileId, kind])` / `@@index([profileId, createdAt])` 已满足）；若列表按 kind/时间/关键词的查询计划需要再评估索引。Profile→User 关联已存在，列表项可直接带出 email。

## 非目标

- **pgvector / embedding 向量检索**：推后单独一期（需 embedding 列 + Neon pgvector 扩展 + OpenAI key；DeepSeek 不支持 embed；会改变检索语义）。
- **画像反向回写**（记忆 → `Profile` 字段自动更新）：不在本期。
- **用户侧自查入口**（铃在会话页查看「Fairy 记住了什么」）：不在本期（REST 与管理面均 admin-only）。
- 不改变 FU-14 的抽取频率、注入上限（≤5 条）与静默降级语义；不改 `chatEventSchema` / SSE 协议。

## 受影响模块

| 模块 | 说明 |
|---|---|
| `packages/shared` | `memorySchemas.ts` 扩展：`memoryQuerySchema`、`memoryListItemSchema`、`memoryCreateSchema`、`memoryUpdateSchema` + 类型 + 测试；经 `index.ts` 导出 |
| `apps/api` | `memory/memoryService` 增加 admin 查询（join Profile→User 带 email/分页/过滤）与 `createMemory/updateMemory/deleteMemory`（复用 `addMemory`/校验）；新增 `routes/memories.ts`（全部 `requireRole("admin")`）+ controller；`app.ts` 挂载 |
| `apps/web` | `api/memoryApi.ts`；`/admin/memories` 页（`RequireAuth role="admin"`）+ 管理导航入口 + zh-CN i18n |
| 文档 | `API_CONTRACT.md`（新端点 + envelope 表）、`ARCHITECTURE.md`（模块/数据流 + §8 决策行）、`PROJECT_STATUS.md` |

## 验收标准

- **AC-1**：admin `GET /api/memories` 返回分页列表：条目含 `id/userId/email/kind/content/sessionId/createdAt`；支持 `?userId=`、`?kind=`、`?keyword=`（content 包含）过滤与 `?page=/?limit=`；`total` 与过滤结果一致、按 `createdAt` 倒序。
- **AC-2**：权限——无 token 401；`role=user` 403（`FORBIDDEN`，沿用既有 admin 路由 `requireRole("admin")` 约定）；仅 admin 200。
- **AC-3**：admin `POST /api/memories`（`{userId, kind, content, sessionId?}`）201 返回落库记录；Profile 不存在 404（`PROFILE_NOT_FOUND`）；非法 kind / 空 content / 未知 userId 400（`VALIDATION_ERROR`）；落库行可被 `GET` 列表与 `searchMemories` 检索到（即下一轮对话注入）。
- **AC-4**：admin `PATCH /api/memories/:id`（`{kind?, content?}` 至少一项）200 返回更新后记录；未知 id 404（`MEMORY_NOT_FOUND`）；非法取值 400。
- **AC-5**：admin `DELETE /api/memories/:id` 200 `{code:"OK", data:{id}}`（沿用 movie DELETE 约定）；行删除后列表与 `searchMemories` 均不再出现；未知 id 404。
- **AC-6**：web `/admin/memories`——admin 可导航进入并完成列表/筛选/分页/新增/编辑/删除（删除有确认；加载/错误/空态齐全；全部中文）；user 访问被既有 `RequireAuth role="admin"` 拦下（跳首页/403）；刷新后数据持久。
- **AC-7**：回归——经端点/管理页写入的记忆在**全新会话**中被注入（复用 FU-14 AC-3 场景）；管理 REST 不依赖 LLM，LLM/key 不可用时管理面全功能可用；api/shared/web 三包测试 + typecheck 全绿。

## 待决问题（已拍板 2026-09-06）

1. **pgvector/embedding 是否本期做**：✅ 推后，单独一期（用户拍板）。
2. **可见/可管范围**：✅ 仅 admin 管理面（REST 与 UI 均 admin-only），用户侧自查入口不做（用户拍板）。
3. **删除语义**：硬删（`Memory` 无外键引用，物理删除即可；沿用 movie DELETE 的 `{code:"OK"}` envelope）。
4. **手动新增是否允许**：允许（admin 补录，`searchMemories` 同链路复用）。

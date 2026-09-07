# Design: 2026-09-07-memory-self-inspection

## Context

现状核对（2026-09-07）：

- `Memory.profileId` 引用 `Profile.userId`（`Profile` 以 `userId` 为 `@id`）→ **`profileId == 用户 id`**。鉴权中间件在 `res.locals.userId` 暴露当前登录用户 id（`routes/chat.ts` 即按此拿身份、以 `profileId: userId` 查询记忆）。「自查 /me」因此不需要任何 join：`where { profileId: userId }` 即本人。
- `routes/memories.ts`（FU-15）现有 `GET /`、`POST /`、`PATCH /:id`、`DELETE /:id`，全部 `requireRole("admin")`；**没有 `GET /:id`** → 新增 `GET /me` 无路由顺序冲突，放在同 router 即可。鉴权用既有 `authMiddleware`（任意已登录角色），不用 `requireRole("admin")`。
- `memoryService.listMemories(query)`（admin，join Profile→User 带 email）与 `searchMemories(profileId, opts)`（FU-14/16 检索注入，`kind`/`keyword`/limit，`createdAt desc`）已存在。`listOwnMemories(profileId, query)` = 复用检索的过滤语义、按 admin 列表的分页返回形状（items + pagination.total），**不做 join、不含 email**——实现可基于 `searchMemories` 的 where 构造 + count。
- shared `memorySchemas` 已有 `memoryQuerySchema`（page/limit/userId/kind/keyword）、`memoryListItemSchema`（含 userId/email）。自查 query 是它的**去 userId 子集**；自查列表项是 admin 列表项去 `userId/email` 的子集。Zod object 默认剥除未知键 → 客户端即使传 `userId`/`email` 也会被 schema 剥掉，天然满足「越权参数忽略」。
- web：会话页 `components/chat/ChatPage.tsx`（348 行，含 MessageStream/RecommendationCard/TripTimeline/会话侧栏）；admin 记忆页 `components/admin/MemoryAdminPage.tsx` 已有 kind 中文标签与列表 UX 可参照；`lib/memoryApi.ts`（FU-15）已有 admin CRUD，加 `listMyMemories` 走统一 `lib/http` 客户端；文案统一 `lib/i18n` + `locales/zh-CN.json`。

## Goals / Non-Goals

**Goals:**
- 任意已登录用户在会话页可查看**本人**记忆：时间倒序、分页/`kind`/`keyword` 过滤，条目带 kind 中文标签与来源标注。
- 新增 `GET /api/memories/me`：本人隔离由 token 决定，越权参数忽略；无 email/embedding/他人数据。
- 严格只读；admin 管理面与既有端点零变化；无 DB 迁移。

**Non-Goals:**
- 用户新增/编辑/删除/修正记忆（改删与「遗忘权」二期）。
- 显式 `source` 列或区分「店员录入 vs 种子」的精细来源（本期以 `sessionId` 有无推断，文案中性化）。
- 自查独立页面/个人中心（本期仅在会话页内做面板）。
- 展示 email、admin 字段、embedding/向量信息、metadata。

## Decisions

1. **端点在既有 memories router 上新增 `GET /me`（任意登录角色）**
   与 admin 端点同 router 但只挂 `authMiddleware`（不 `requireRole`）。实现 `memoryService.listOwnMemories(profileId, query)`——`profileId` 取自 `res.locals.userId`（函数签名强制传参，杜绝越权）；返回 `{ items, pagination }` 与 admin 列表同构（仅条目少 email/userId）。

2. **自查 query 与列表项 = admin schema 的去 userId/email 子集**
   `memorySelfQuerySchema`：`page/limit/kind/keyword`（默认值与限制同 admin）；`memorySelfListItemSchema`：`{ id, kind, content, sessionId?, createdAt }`。`metadata` 不下发（用户已拍板默认）。Zod 剥未知键即实现「传 userId/email 被忽略」。

3. **来源标注在 UI 侧由 `sessionId` 推断**（用户已拍板「时间倒序 + kind + 来源」）
   API 保持通用形状（返回 `sessionId?`），面板按 `sessionId != null` → 「对话抽取」，否则 → 「系统录入」；标签文案在 `locales/zh-CN.json` 集中管理，组件测试按此映射断言（确定性）。

4. **面板承载在会话页内，不新增路由**
   `ChatPage` 操作区加「Fairy 记住了什么」按钮 → 展开 `MemorySelfPanel`（可折叠）。面板含加载/错误/空态，列表分页默认 20（复用 `memoryQuerySchema` 的分页语义，后续记忆多了不返工）。kind 中文标签复用 admin 页既有映射的 i18n key。

5. **权限边界**
   user 与 admin 在会话页都能自查（各自只能看本人——admin 的自查 ≠ 管理面全量列表）；管理面 `GET /api/memories` 等仍 `requireRole("admin")` 不变。测试用两个不同 profileId 的记忆 fixture 验证隔离。

## Acceptance mapping

- AC-1（面板自查 + 来源标注）→ 决策 3/4：`MemorySelfPanel` 渲染本人记忆、`sessionId` 有无两种标注；空态/加载态。
- AC-2（本人隔离 + admin 面不变）→ 决策 1/5：`/me` 只回 `profileId == 本人`；admin 管理面路由仍 403 非 admin。
- AC-3（契约：401/200、忽略越权参数、不含 email/embedding）→ 决策 1/2：路由测试 + schema 测试。
- AC-4（测试 mock 化）→ shared/api/web 三层单测，不碰真实 DB/LLM。
- AC-5（三包 typecheck + 真机手动）→ 验证阶段。

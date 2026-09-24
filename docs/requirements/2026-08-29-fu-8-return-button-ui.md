# FU-8 一键归还 UI（含 rentals 查询端点）

**Date:** 2026-08-29（grill-me 收敛：2026-09-01；批准：2026-09-01）
**Status:** implemented（已交付并归档；真机验收与归档记录见 PROJECT_STATUS.md Completed Modules）
**Complexity:** moderate

## Goal

为 FU-4 已落地的归还能力补上 UI 入口：用户在 chat 页看到「我的借阅」并可一键归还；推荐卡片对已借影片把「借阅」按钮切换为「归还」。**依赖 FU-4 核心已交付**（`rentalService.returnRental`、SSE `return` 事件、`RETURN_SUCCESS` 枚举）与 **FU-6**（REST 借阅，语义已稳定）。

## Background

- 从 FU-4 拆分而来（用户 2026-08-29 拍板）：按钮对 FU-4 核心是单向依赖，拆出后核心 diff 减半且 web 零改动；按钮本质是租借状态展示，排 **FU-6（REST borrow）之后**实施，届时「chat 还 + REST 借」语义稳定，状态切换 UI 一次写对。
- 拆分时确认的边界：归还的库存变更仍只走 chat 工具链（架构 §8 双写禁令）——按钮提交的是**结构化 chat 请求**，不是新的 REST 写接口。

## Scope（grill-me 收敛后）

### API

- **`GET /api/rentals`**（挂载 scaffold 遗留的 `rentalsRouter` 占位，Bearer 必需）：
  - 本人：返回自己的全部借阅（含 `RETURNED`），`createdAt` 倒序；`?status=ACTIVE` 只返回活跃借阅。
  - admin：默认看自己；`?userId=<uuid>` 可代查任意用户；不存在的 `userId` → 404 `USER_NOT_FOUND`；有效但无借阅 → 200 空数组；非 UUID `?userId` → 400 `INVALID_USER_ID`。
  - 行形状：`{ rentalId, movieId, movieTitle（解析）, status, borrowedAt, returnedAt? }`。不分页（单人借阅量小；对标 profiles「Pagination not required」）。
- **chat 请求 `action` 参数**：`chatRequestSchema` 增 `action?: z.enum(["return"])`，并做联合校验——**action 存在时必须带 movieId，否则 400 `VALIDATION_ERROR`**（严格，缺 movieId 属客户端 bug，不静默回落）。`{ message: "", movieId, action: "return" }` 为一键归还的确定性路径：`stateLoop` 直达 `returnMovieTool`，**不经 LLM / 意图分类**（同「一键借阅」movieId 直传模式）；此路径下 `message` 被忽略。

### Web

- **chatStore**：存 `activeRentals`（`RentalListItem[]`），挂载时与每次 SSE `done` 后 refetch `GET /api/rentals?status=ACTIVE`；SSE `return` 事件 `success` 时本地乐观移除对应项。
- **「我的借阅」条**：chat 页顶部常驻；无活跃借阅时**整条隐藏**；行 = 片名 chip + 归还按钮，点击发送 `{ message: "", movieId, action: "return" }`，pending 期间禁点防重复提交；归还成功后 chip 即时消失。
- **`RecommendationCard`**：新增 `isBorrowed` prop；影片在 ACTIVE 集合内时「借阅」按钮替换为「归还」（归还按钮**不受 `stock < 1` 禁用**——有活跃借阅即可还）；归还成功后恢复「借阅」。
- **SSE `return` 事件消费**：`useSSE`/`chatApi.parseSseBuffer` 处理 `return` 事件——`success: true` → 确认 text 入流 + 乐观移除 chip；`success: false`（如并发下 `RENTAL_NOT_FOUND`）→ **聊天流内 text 事件**（Agent 语气解释，如「这部影片不在你的借阅中哦」）+ refetch 校正借阅条与卡片状态。

### 测试

- shared：`chatRequestSchema` 的 action 联合校验（有 action 无 movieId → 拒绝）。
- api：rentals 路由（本人 200 含标题解析 / `?status=ACTIVE` 过滤 / 他人 403 / admin `?userId=` 代查 / 404 `USER_NOT_FOUND` / 400 `INVALID_USER_ID` / 401）；chat action 确定性路径（成功发 `return` 事件、失败发道歉 text 且不 500）；`stateLoop` action 分支直通工具。
- web：借阅条渲染与空态隐藏、归还后 chip 消失、卡片按钮「借阅⇄归还」切换、action 请求发送（断言请求体 `{ movieId, action: "return" }`）。

## Out of Scope

- REST `POST /api/returns`（保持 chat 单一写路径）；逾期/罚金/提醒；管理端代还 UI（admin 代查仅 API）；copy-level 跟踪；借阅分页。

## Key Decisions（grill-me 收敛）

| Decision | Choice | Rationale |
|---|---|---|
| 归还提交路径 | chat `{ movieId, action: "return" }` | 双写禁令；与一键借阅同模式 |
| 借阅状态来源 | `GET /api/rentals` 而非 SSE 附带 | 页面首屏就要有状态；本地记账刷新即丢 |
| rentals 鉴权范围 | user 只看自己；admin 可 `?userId=` 代查 | 对标 FU-1 profiles 读鉴权；为将来管理端留口，成本低 |
| action 校验 | 严格：`action:"return"` 必须配 movieId，缺则 400 | 缺 movieId 是客户端 bug，显式报错优于静默回落文本意图 |
| 借阅条空态 | 空态隐藏整条，归还后 chip 消失 | 无噪音；已借影片仍由卡片「归还」按钮体现，状态不丢 |
| 归还失败反馈 | 聊天流内 text 事件 + refetch 校正 | 与现有 chat UX 一致，两个入口点击后都能看到解释 |
| 实施时点 | FU-6 之后 | 借/还语义齐备后一次写对状态切换 UI |

## Affected Modules

- `Fairy/apps/api`：rentals 路由（占位转正）、chat 路由（action 参数）、`stateLoop`（action 直通分支）、`__tests__/`
- `Fairy/apps/web`：chatApi、ChatPage、RecommendationCard、chatStore、useSSE、i18n、`__tests__/`
- `Fairy/packages/shared`：`chatRequestSchema`（action 联合校验）
- `API_CONTRACT.md`（rentals 端点 + chat action 参数）

## Acceptance Criteria

- **AC-1** 登录 user 后，chat 页顶部出现「我的借阅」，列出 ACTIVE 借阅（片名 + 归还按钮）；无活跃借阅时整条隐藏。
- **AC-2** 点击归还 → 聊天流出现确认 text、chip 消失、库存回补（DB 校验：该 rental `RETURNED` + 影片 `stock+1`）。
- **AC-3** 推荐卡片对已借影片显示「归还」而非「借阅」（含 stock=0 的已借影片也可还）；归还成功后恢复「借阅」。
- **AC-4** 借阅条与卡片两入口归还同一部影片，第二次点击返回失败 → 聊天流道歉 text，状态校正，无 500。
- **AC-5** admin `GET /api/rentals?userId=<uuid>` 可代查任意用户；user 查他人 403；不存在的 userId 404；非 UUID 400。
- **AC-6** 一键归还与 chat 文本归还（「还 X」）共用同一事务与日志——REST 借入后按钮归还，流水页出现 `RETURN_SUCCESS`。

## Next Step

- [x] grill-me 收敛（2026-09-01，四项决策已定）
- [x] 用户批准（2026-09-01）
- [ ] `/opsx:propose` → approve → apply

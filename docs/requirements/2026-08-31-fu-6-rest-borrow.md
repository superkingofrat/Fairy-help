# FU-6 REST `POST /api/borrow`

**Date:** 2026-08-31
**Status:** approved
**Complexity:** simple

## Goal

提供 REST 借阅旁路 `POST /api/borrow`：登录用户以 `{ movieId }` 直接借片，返回 `{ rentalId, remainingStock }`。库存写入**复用同一 `rentalService.borrow` 事务与同一日志组合**（借由 `borrowMovieTool`——服务 + 日志的既有封装），不存在第二套借阅逻辑；**web 零改动**（卡片状态与 REST 切换留给 FU-8 一次做对）。

## Background

- 路线图（[2026-08-21-phase2-agent-recommend-borrow.md](./2026-08-21-phase2-agent-recommend-borrow.md)）：FU-6 =「REST `POST /api/borrow`」；API_CONTRACT §5 未来端点早已预留「REST 借阅旁路」。
- ARCHITECTURE §8 的「借阅仅经 `/api/chat` 工具」是 Phase 2 的过渡决策，前提是避免**两套写逻辑**；如今 REST 与 chat 共用同一 `rentalService.borrow` 事务与同一日志封装，双写担忧的前提已消失——本轮需同步修订该决策行。
- 现状：`rentalService.borrow` 完整事务（`MOVIE_NOT_FOUND`/`ALREADY_BORROWED`/`OUT_OF_STOCK`/条件减库存/建 ACTIVE 租借）无新逻辑需求；`borrowMovieTool` = 服务 + `BORROW_SUCCESS`/`BORROW_OUT_OF_STOCK` 日志，可被 REST 控制器直接复用；`rentalsRouter` 占位未挂载。
- 认证已是 JWT（FU-5）：借阅人 = token subject，**userId 永不来自请求体**。
- FU-8（一键归还 UI）将重做推荐卡片状态；本轮若把卡片切到 REST，FU-8 还要再碰同一组件——故 web 零改动。
- 无需用户拍板项：端点路径与语义被路线图钉死，其余均为单向技术选择。

## Requirements

- **REQ-1** 挂载并实现 `POST /api/borrow`（Bearer 必需；任何登录用户为自己借片；无 admin 限制）。请求体 `{ movieId: uuid }`（Zod 校验，非法 400 `VALIDATION_ERROR`）。userId 取 `res.locals.userId`，**请求体不得携带 userId**。
- **REQ-2** 成功 `201`：`{ code: "OK", data: { rentalId, remainingStock }, msg: "借阅成功" }`；失败映射：`MOVIE_NOT_FOUND` → 404、`ALREADY_BORROWED` → 409、`OUT_OF_STOCK` → 409（`{ code, data: null, msg }` 信封，错误码与 chat `borrow` 事件一致）。
- **REQ-3** 复用 `borrowMovieTool`（服务事务 + `BORROW_SUCCESS`/`BORROW_OUT_OF_STOCK` 日志组合不变），**不新增第二套借阅逻辑**；未认证 401（中间件）。
- **REQ-4** 测试：路由层（201 成功含 remainingStock / 404 / 409 两种 / 400 非法 uuid / 401 未认证 / 日志断言）；web 回归（零改动）。service 层已有测试不重复。
- **REQ-5** 文档：`API_CONTRACT.md` 新增 REST 借阅端点节、§5 移除该未来端点；`ARCHITECTURE.md` §8 决策行修订为「库存写入统一经 `rentalService.borrow`；传输可为 chat 工具或 REST」并在 §5.2 标注双入口；`PROJECT_STATUS.md` 归档阶段更新。

## Acceptance Criteria

- **AC-1**（自动化）登录用户 `POST /api/borrow` 合法 `movieId` → 201 `{ rentalId, remainingStock }`，库存 -1、`ACTIVE` 租借创建、`BORROW_SUCCESS` 日志写入（断言 service/日志调用）。
- **AC-2**（自动化）重复借同一部 → 409 `ALREADY_BORROWED` 且库存不变；借 `OUT_OF_STOCK` 影片 → 409 `OUT_OF_STOCK` 且日志记 `BORROW_OUT_OF_STOCK`；借不存在影片 → 404 `MOVIE_NOT_FOUND`。
- **AC-3**（自动化）未认证（无 token）→ 401；`movieId` 非 UUID → 400 `VALIDATION_ERROR`；请求体携带 `userId` 字段被忽略（身份只来自 token）。
- **AC-4**（自动化）web 全部测试回归通过（零改动确认）；既有 chat 借阅路径不受影响（同一 service）。
- **AC-5**（联调）真机：REST 借出的影片在 chat 中说「还 X」可正常归还（两入口共用同一数据）。

## In Scope

- `POST /api/borrow`（挂 `rentalsRouter` 占位转正）+ 错误映射
- 复用 `borrowMovieTool`；路由层测试
- 脊柱文档同步（含 ARCHITECTURE §8 决策修订）

## Out of Scope

- `GET /api/rentals` 与一键归还 UI（FU-8）；前端切换到 REST 借阅
- REST 归还端点（归还保持 chat 单一写路径；是否对称 REST 化随 FU-8 另议）
- 批量借阅、预约/排队、逾期字段

## Key Decisions

| Decision | Choice | Rationale | Trade-off |
|---|---|---|---|
| 端点 | `POST /api/borrow`（路线图钉死） | 与契约 §5 预留一致；命名直白 | 非 REST 纯资源式（`POST /api/rentals`），记录在案 |
| 身份 | 仅 token subject，body 无 userId | FU-5 身份真实化后的自然推论 | admin 无法代借（无此需求） |
| 复用 | 直接调用 `borrowMovieTool` | 服务事务 + 日志组合唯一，杜绝逻辑分叉 | "tool" 命名在 REST 语境略别扭（可后续更名，非本轮） |
| 错误映射 | 404/409/409 对应三错误码 | REST 语义标准；错误码与 chat 一致 | — |
| web | 零改动 | 卡片状态归 FU-8 一次做对，避免两轮碰同一组件 | 前端暂仍走 chat 借阅 |
| §8 修订 | 双写禁令前提消失，改为「单一服务、多传输」 | 服务唯一即无分叉 | 需同步 ARCHITECTURE（本轮内完成） |

## Technical Notes

- `rentalsRouter` 挂载：`app.use("/api/borrow", authMiddleware, rentalsRouter)` 或直接 `router.post("/borrow", ...)` 于 `/api` 根——实现取「`app.use("/api/rentals", ...)` 挂载 + 路由内 `post("/borrow")`」与「单独 `/api/borrow`」二选一，propose 阶段定为：**`rentalsRouter` 转正挂 `/api/rentals`，其中 `POST /borrow` 由 `POST /api/rentals/borrow` 承载？——不：路线图钉死 `/api/borrow`，故新建 `borrowRouter` 挂 `/api/borrow`，`rentalsRouter` 占位留给 FU-8 的 `GET /api/rentals`**。
- 控制器薄：validateBody 后调 `borrowMovieTool`，按 result.ok 映射状态码。
- 错误 msg 中文，与既有端点风格一致。

## Risks & Open Questions

- 无阻塞项。双入口并发（chat 与 REST 同时抢同一部片）由既有事务的条件减库存保证，不超卖。

## Affected Modules

- `Fairy/apps/api`：`routes/borrow.ts`（新）、`controllers/borrowController.ts`（新）、`app.ts`、`__tests__/borrow.test.ts`（新）
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`
- `Fairy/apps/web` **零改动**

## Next Step

- [x] User approves this doc
- [ ] Run `/opsx:propose`（change：`fu-6-rest-borrow`）
- [ ] User reviews artifacts, then `/opsx:apply`

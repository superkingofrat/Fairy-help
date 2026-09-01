## Why

借阅至今只有 chat 一条传输口；`POST /api/borrow` 是路线图与契约 §5 早已预留的 REST 旁路。Phase 2 的「双写禁令」前提（两套写逻辑）随 FU-5 后的服务复用消失——REST 控制器直接复用 `borrowMovieTool`（同一 `rentalService.borrow` 事务 + 同一日志组合），零新逻辑。grill-me 需求已批准（`docs/requirements/2026-08-31-fu-6-rest-borrow.md`）；web 零改动（卡片状态归 FU-8）。

## What Changes

- 新增 `POST /api/borrow`（Bearer 必需）：请求体 `{ movieId: uuid }`（Zod 校验）；借阅人 = token subject（请求体携带 `userId` 被忽略）。
- 成功 201 `{ code: "OK", data: { rentalId, remainingStock } }`；`MOVIE_NOT_FOUND` → 404、`ALREADY_BORROWED`/`OUT_OF_STOCK` → 409、非法 body → 400 `VALIDATION_ERROR`、未认证 → 401。
- 复用 `borrowMovieTool`（服务事务 + `BORROW_SUCCESS`/`BORROW_OUT_OF_STOCK` 日志），不新增第二套借阅实现；`rentalsRouter` 占位保留给 FU-8 的 `GET /api/rentals`。
- 同步 `API_CONTRACT.md`（新端点节、§5 移除该预留）与 `ARCHITECTURE.md`（§8 决策修订为「库存写入统一经 `rentalService.borrow`；传输可为 chat 工具或 REST」+ §5.2 双入口标注）。
- **web 零改动**；Apply 完成后 archive 并更新 `PROJECT_STATUS.md`。

## Capabilities

### New Capabilities

- （无。借阅事务归属既有 `movie-rental`。）

### Modified Capabilities

- `movie-rental`: 新增 REST 借阅端点需求——与 chat 结构化借阅共用同一事务与日志，身份取自 token，错误码映射为 HTTP 状态。

## Impact

- 代码：`Fairy/apps/api`（`routes/borrow.ts`、`controllers/borrowController.ts`、`app.ts`、shared `borrowRequestSchema`、`__tests__/borrow.test.ts`）
- 认证：Bearer 必需（FU-5 中间件）；行为日志语义不变
- 新增环境变量：无；web：零改动
- 需求来源：`docs/requirements/2026-08-31-fu-6-rest-borrow.md`

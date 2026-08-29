## Why

BehaviorLog 自 Phase 2 起只写不读：`behaviorLogService` 仅有 `append()`，绳匠要看用户行为流水只能查数据库。表上没有任何二级索引，共享层也没有它的类型。grill-me 需求已批准（`docs/requirements/2026-08-29-fu-3-behavior-log-query-admin-ui.md`），用户拍板流水**仅 admin 全量可见**。

## What Changes

- 新增 admin-only `GET /api/behavior-logs`：分页（默认 1/20，上限 100）+ `action` 枚举筛选 + `userId` UUID 筛选，`createdAt` 倒序；列表项含 `email`（include user）、`movieTitle`（`movieId` 经新增 `movieService.listMoviesByIds` 批量解析，防 N+1）、`recommendCount`（RECOMMEND 行 payload.movieIds 长度，payload 本体不下发）。
- **append-only 红线不变**：不提供任何 DELETE/PUT/PATCH 行为日志端点；phase2 归档 spec 中「No log query surface」需求按流程 REMOVED，由新的 admin 查询需求替代。
- Prisma `BehaviorLog` 增加 `@@index([createdAt])`，迁移 `add_behavior_log_created_at_index`（本轮唯一 db 变更）。
- 新增 `/admin/behavior` 管理页（对标 `ProfilesAdminPage`）：时间/邮箱/中文动作/影片列、动作筛选下拉、上一页/下一页、加载/错误/空态；导航与现有管理页并列，文案全走 i18n；chat 页零改动。
- 同步 `API_CONTRACT.md`（新 §3.9）、`ARCHITECTURE.md`（web 组件清单）；Apply 完成后 archive 并更新 `PROJECT_STATUS.md`。

## Capabilities

### New Capabilities

- （无。查询能力归属既有 `behavior-log` 能力。）

### Modified Capabilities

- `behavior-log`: 移除「本轮不提供查询面」的需求，新增 admin 分页查询需求（含筛选、解析字段与 append-only 保持）；写入侧（recommend/borrow/缺货/未匹配不记）全部不变。

## Impact

- 代码：`Fairy/packages/shared`（schema/类型）、`Fairy/packages/database`（schema + 1 迁移）、`Fairy/apps/api`（service ×2、controller、router、app.ts、测试）、`Fairy/apps/web`（behaviorApi、新页、导航、i18n、测试）
- 认证继续 dev stub；查询仅 admin
- 新增环境变量：无；SSE/聊天行为：零改动
- 需求来源：`docs/requirements/2026-08-29-fu-3-behavior-log-query-admin-ui.md`

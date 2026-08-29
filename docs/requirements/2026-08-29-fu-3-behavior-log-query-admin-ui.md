# FU-3 BehaviorLog 查询与流水管理页

**Date:** 2026-08-29
**Status:** approved
**Complexity:** moderate

## Goal

绳匠在 `/admin/behavior` 查看所有用户的行为流水（推荐/借阅事件），接口 admin-only、分页、可按动作与用户筛选；BehaviorLog 保持只追加写入（append-only），不做任何修改/删除端点。

## Background

- Phase 2 既定（[2026-08-21-phase2-agent-recommend-borrow.md](./2026-08-21-phase2-agent-recommend-borrow.md) FU 表）：FU-3 =「BehaviorLog 查询与流水 UI」，红线是**只追加写入**。
- 现状：`behaviorLogService` 只有 `append()`，无任何读路径；写入点两处——`recommendMovieTool` 记 `RECOMMEND`（payload.movieIds）、`borrowMovieTool` 记 `BORROW_SUCCESS`（movieId+rentalId）/`BORROW_OUT_OF_STOCK`（movieId）。
- Prisma `BehaviorLog` 无任何二级索引（`@@map("behavior_logs")`），查询等于全表扫；加索引 = 一次迁移。
- shared 尚无 BehaviorLog 类型/schema；契约「未来端点」中的 `GET /api/admin/insights` 是聚合看板，与原始流水无关，保持不动。
- web 已有 `/admin/movies`、`/admin/profiles` 两个管理页先例（`MoviesAdminPage`/`ProfilesAdminPage` + 导航 + i18n + `X-Dev-Role: admin` 调用模式）。
- 轨道判定：跨 web + api + shared + db（一次迁移），且新增公开端点 → 按 §15.1 走 **OpenSpec 轨**。
- 用户已拍板：流水**仅管理员看全部**（对标 profiles 列表鉴权；用户侧自看出圈）。

## Requirements

- **REQ-1** shared：新增 `behaviorLogSchema`（id/userId/action/movieId/rentalId/payload/createdAt，`createdAt` 为 ISO 字符串）、`behaviorActionValues = ["RECOMMEND","BORROW_SUCCESS","BORROW_OUT_OF_STOCK"]`、`behaviorLogQuerySchema`（`page`/`limit` 默认 1/20 上限 100，对标 `listMoviesQuerySchema`；`action?` 枚举；`userId?` uuid）。中文动作文案放 web i18n，枚举值保持英文。
- **REQ-2** API：`GET /api/behavior-logs`——仅 admin（`requireRole("admin")`，非 admin 403 `FORBIDDEN`）；按 `createdAt` 倒序；query 校验失败 400 `VALIDATION_ERROR`、非法 `userId` 400 `INVALID_USER_ID`；响应 `{ code, data: { items, pagination }, msg }`。**不提供**任何 DELETE/PUT/PATCH 行为日志端点（append-only，路由层不注册即 404）。
- **REQ-3** 列表项形状：`{ id, userId, email, action, movieId, movieTitle|null, rentalId, recommendCount|null, createdAt }`——`email` 由 include user 展开；`movieTitle` 由 `movieId` 批量解析（`movieService` 新增 `listMoviesByIds(ids)`，findMany where id in 去重后映射）；`recommendCount` 仅 RECOMMEND 行有值（payload.movieIds 长度），payload 本体不下发。
- **REQ-4** service：`behaviorLogService.listLogs({ page, limit, action?, userId? })` 返回 `{ items, total }`（findMany include user + count 并行，skip/take 对标 `listMovies`）。
- **REQ-5** Prisma：`BehaviorLog` 增加 `@@index([createdAt])`，迁移名 `add_behavior_log_created_at_index`；不改其他模型。
- **REQ-6** Web：`/admin/behavior` 页（对标 `ProfilesAdminPage` 结构）——表格列：时间 / 用户邮箱 / 动作（中文）/ 影片（`movieTitle` 或 RECOMMEND 显示「推荐了 N 部」或「-」）；筛选条：动作下拉（全部 + 三枚举）+ 分页（上一页/下一页）；加载/错误/空状态齐全；导航与 `/admin/movies`、`/admin/profiles` 并列，文案全部走 `zh-CN.json`。chat 页零改动。
- **REQ-7** 测试：API 路由测试（admin 200 含解析字段、user 403、action/userId 筛选、非法 userId 400、空列表、无 DELETE 404）；`listMoviesByIds` 与 `listLogs` 轻量 service 测试（mock `@fairy/database`，同 `rentalService.test` 模式）；web 页面测试（mock `behaviorApi`，渲染行/筛选/空态）。
- **REQ-8** 文档：`API_CONTRACT.md` 新增 §3.9 行为流水端点（错误码复用 `FORBIDDEN`/`VALIDATION_ERROR`/`INVALID_USER_ID`，无新增）；`ARCHITECTURE.md` web 组件清单补 `BehaviorPage`；`PROJECT_STATUS.md` 在归档阶段更新。

## Acceptance Criteria

- **AC-1**（自动化）`X-Dev-Role: user` 调 `GET /api/behavior-logs` → 403 `FORBIDDEN`。
- **AC-2**（自动化）admin 查询返回 `{ items, pagination }`、按 `createdAt` 倒序，行内 `email`/`movieTitle`/`recommendCount` 正确解析；空表返回空 items。
- **AC-3**（自动化）`action=RECOMMEND` 只返回该类；未知 action → 400 `VALIDATION_ERROR`。
- **AC-4**（自动化）`userId` 非 UUID → 400 `INVALID_USER_ID`；合法 UUID → 只返回该用户的流水。
- **AC-5**（自动化）`DELETE /api/behavior-logs/:id` 等修改方法 → 404（append-only 红线）。
- **AC-6**（自动化）web 测试：`/admin/behavior` 渲染流水行（时间/邮箱/中文动作/影片名）、动作筛选切换、加载/错误/空态可见。
- **AC-7**（自动化）迁移可应用（`migrate dev`），四包测试 + typecheck 全绿。

## In Scope

- shared schema/类型；`GET /api/behavior-logs`（admin-only）；`listLogs` + `listMoviesByIds`
- `@@index([createdAt])` 迁移（本轮唯一 db 变更）
- `/admin/behavior` 管理页 + 导航 + i18n
- 路由/服务/web 三层测试；脊柱文档同步

## Out of Scope

- 时间范围筛选；聚合统计/看板（`GET /api/admin/insights` 留在未来端点）
- 用户侧自看流水；行为日志的删除/修改/导出
- RECOMMEND payload 内 movieIds 全量解析为片名列表（只显示数量）
- 写入点扩展（如画像变更入日志——原 Phase 2 决策明确不入，维持）

## Key Decisions

| Decision | Choice | Rationale | Trade-off |
|---|---|---|---|
| 面向谁 | 仅 admin 全量流水（用户拍板） | 对标 profiles 鉴权；隐私边界清晰 | 用户侧自看延后 |
| 轨道 | OpenSpec 轨 | 跨 web+api+shared+db 且改公共契约 | 比 Trellis 轨多两道门 |
| append-only | 无任何修改/删除端点 | Phase 2 既定红线 | 错误日志无法人工清理 |
| 筛选 | API 支持 action+userId；UI 本轮只做 action+分页 | 接口先行，UI 最小可用 | admin 按 user 筛选需直接拼 URL |
| 索引 | 本轮加 `@@index([createdAt])` | 查询功能不配全表扫；迁移廉价 | 写入略微变慢（可忽略） |
| 影片解析 | `movieId` 批量解析片名；RECOMMEND 显示数量 | 一页 N 行一次 findMany，避免 N+1 | payload 全量解析出圈 |
| 中文文案 | 放 web i18n | shared 枚举保持英文值，前后端不耦合 | 新增动作需同步 i18n |

## Technical Notes

- 路由挂载对标 movies：`app.use("/api/behavior-logs", authMiddleware, behaviorLogsRouter)`；控制器薄、错误映射集中在 controller。
- 列表查询：`prisma.behaviorLog.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, skip, take })` + `count({ where })` 并行。
- `listMoviesByIds`：入参去重空值过滤，返回 `Map<id, title>` 或 `Pick<Movie,"id"|"title">[]`（propose 阶段定签名）。
- web 页对标 `ProfilesAdminPage`：`behaviorApi.ts`（`X-Dev-Role: admin`，同 movieApi 的 request 模式）；分页用页码 state + 上一页/下一页按钮。
- 测试：路由层 mock service（同 `profiles.test.ts`）；service 层 mock `@fairy/database`（同 `rentalService.test.ts`）；web mock `behaviorApi`（同 `ProfilesAdminPage.test.tsx`）。

## Risks & Open Questions

- 无阻塞项。payload 为 Json 类型，RECOMMEND 行若缺 movieIds 字段则 `recommendCount` 为 null（前端显示「-」），防御式处理。

## Affected Modules

- `Fairy/packages/shared`（schemas/types）
- `Fairy/packages/database`（schema.prisma + 1 个迁移）
- `Fairy/apps/api`（behaviorLogService、movieService、controller、router、app.ts、`__tests__/`）
- `Fairy/apps/web`（behaviorApi、`/admin/behavior` 页、App 导航、i18n、测试）
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`

## Next Step

- [x] User approves this doc
- [ ] Run `/opsx:propose`（change：`fu-3-behavior-log-query-admin-ui`）
- [ ] User reviews artifacts, then `/opsx:apply`

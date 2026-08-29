## Context

See `proposal.md` and the approved requirements doc. BehaviorLog is append-only today (`behaviorLogService.append` from two tools); this change adds the read path only. Web admin pages (`MoviesAdminPage`, `ProfilesAdminPage` + `movieApi`/`profileApi` request pattern) are the established pattern to copy. Dev auth stays the stub; queries are admin-only like the profiles list.

## Goals / Non-Goals

**Goals:**

- One read path: HTTP admin → `behaviorLogService.listLogs` → Prisma (findMany + count 并行)，append-only 不动。
- One resolved feed shape: email 展开 + `movieTitle` 批量解析（一页一次 findMany，防 N+1）+ `recommendCount` 替代裸 payload。
- Web 最小可用：动作筛选 + 分页，其余（时间范围、userId 输入框）出圈。

**Non-Goals:**

- 任何日志修改/删除端点；聚合看板（`GET /api/admin/insights` 留未来端点）；用户侧自看；时间范围筛选；payload 全量解析。

## Decisions

1. **端点形状：`GET /api/behavior-logs`（复数 REST，对标 movies/profiles）**  
   Why: 与既有资源命名一致；无现存客户端，无兼容包袱。  
   Alternative: `/api/admin/behavior-logs` — 与 movies/profiles 的挂载风格不一致。

2. **REMOVED「No log query surface」走正式 delta 流程**  
   Why: phase2 归档 spec 明确写了「本轮不提供查询面」，FU-3 推翻它必须留审计痕迹（Reason/Migration），不能悄悄改主 spec。

3. **`recommendCount` 替代裸 payload 下发**  
   Why: 契约面最小化（payload 是内部实现细节）；UI 只需要「推荐了 N 部」。  
   Alternative: 下发原 payload — 泄漏内部形状，前端还得解析。

4. **`movieTitle` 用 `listMoviesByIds` 批量解析**  
   Why: 一页 ≤100 行，去重后一次 `findMany({ id: { in } })`；比 N+1 `getMovieById` 便宜得多。签名在实现时定为 `Pick<Movie,"id"|"title">[]` 返回。

5. **索引 `@@index([createdAt])` 本轮做**  
   Why: 列表排序与未来时间过滤的主列；迁移廉价；无索引的查询功能是负债。

6. **UI 本轮只做动作筛选 + 页码分页**  
   Why: 最小可用切片；接口层 `userId` 参数先支持，admin 需要按人筛时拼 URL 或下轮加输入框。

7. **中文动作文案放 web i18n**  
   Why: shared 枚举保持英文值（与 Prisma enum 一致），前后端解耦；新增动作只影响 i18n。

## Risks / Trade-offs

- [payload Json 的防御式读取] → RECOMMEND 行缺 movieIds 时 `recommendCount` 为 null，前端显示「-」。
- [迁移需连 dev 库（Neon）] → 冷启动已知坑（`connect_timeout=15`）；若 apply 时不可达，先落迁移文件、`migrate deploy` 留给联调，验收在本地/下次联调完成。
- [大表翻页 offset 分页] → 当前量级与可预见规模下 page/limit 足够；游标分页留 future。

## Migration Plan

- `prisma migrate dev --name add_behavior_log_created_at_index`（或离线生成迁移文件 + 联调时 `migrate deploy`）。
- 部署顺序无要求：新端点在无索引时也能跑（只是慢），索引先行更佳。
- Rollback: 移除路由与页面即可；索引无害保留。

## Open Questions

None blocking；`listMoviesByIds` 返回签名（数组 vs Map）在实现时定，两者都对调用方足够。

## Affected Modules

- `Fairy/packages/shared`：`schemas/behaviorLogSchemas.ts`、`types/behaviorLogTypes.ts`、导出
- `Fairy/packages/database`：`schema.prisma`（1 个 `@@index`）+ 迁移
- `Fairy/apps/api`：`services/behaviorLogService.ts`（listLogs）、`services/movieService.ts`（listMoviesByIds）、`controllers/behaviorLogController.ts`、`routes/behaviorLogs.ts`、`app.ts`、`__tests__/behaviorLogs.test.ts`、`__tests__/movieService.test.ts`（轻量）
- `Fairy/apps/web`：`lib/behaviorApi.ts`、`components/admin/BehaviorPage.tsx`、`App.tsx`、`locales/zh-CN.json`、`__tests__/BehaviorPage.test.tsx`
- `API_CONTRACT.md`（§3.9）、`ARCHITECTURE.md`（web 组件清单）、`PROJECT_STATUS.md`（归档阶段）

## Next Step

- User reviews artifacts, then `/opsx:apply`

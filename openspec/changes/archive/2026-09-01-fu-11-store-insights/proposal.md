## Why

门店已积累 `BehaviorLog` / `Rental` / `Movie` 三类业务数据，但只有 FU-3 的明细流水查询（分页 + 筛选），店长无法获得「什么片最火、借阅趋势、库存压力」等经营结论；「store insights 运营看板」长期挂账在 PROJECT_STATUS Next Steps。需求文档已批准（[docs/requirements/2026-09-01-store-insights.md](../../docs/requirements/2026-09-01-store-insights.md)），本期交付**管理端运营看板**（REST 聚合接口 + `/admin/insights` 页面）；chat 工具（`storeInsightTool`）留待下一期。

## What Changes

- **API**：新增 admin-only `GET /api/insights/overview`（Bearer + `requireRole("admin")`），一次性返回看板全部卡片数据：
  - 热门影片 TOP 5：按借阅次数降序，含片名、借阅数、可借状态（`stock > 0`）、推荐次数（RECOMMEND `payload.movieIds` 计数）。
  - 借阅趋势：最近 14 天按日借出数（`Rental.createdAt`）与归还数（`RETURNED` 的 `updatedAt`），缺日补 0。
  - 库存状态：当前 ACTIVE 借出总数、借出/总库存占比、低库存影片列表（`stock ≤ 1`）。
  - mood/scene 分布：近 30 天借出影片的 mood/scene 计数 TOP 5，仅含有数据的维度。
  - 活跃概况：用户总数、近 7 天活跃用户数（有行为日志 distinct userId）、近 7 天新注册数。
  - user 角色 → 403 `FORBIDDEN`；无 token → 401 `UNAUTHORIZED`。
- **Shared**：新增 `insightSchemas.ts`（`storeInsightsOverview` 响应形状 + 行类型），经 `@fairy/shared` 导出。
- **Web**：新增 `/admin/insights` 看板页（卡片 + 纯 CSS 条形图 + 表格，**不引图表库**）、admin 导航入口、`insightApi` 客户端、i18n；加载/错误/空态齐全。
- **无破坏性变更**：现有端点、错误码、schema 全部保留；只读聚合，不加表、不加埋点、不改任何写入逻辑。

## Capabilities

### New Capabilities

- `store-insights`: 店内经营数据聚合查询与展示（管理端运营看板）——热门影片、借阅趋势、库存状态、mood/scene 分布、活跃概况。

### Modified Capabilities

（无）

## Impact

- `packages/shared`：`insightSchemas.ts` 新增响应形状与类型 + 测试。
- `apps/api`：新增 `insightService`（聚合查询，基于 Prisma `groupBy`/`count`）、`insights` routes/controller（挂 `requireRole("admin")`）、测试。
- `apps/web`：`InsightsAdminPage`、admin 导航、`insightApi`、i18n、测试。
- 文档脊柱：`API_CONTRACT.md`（§3 新增 insights 端点 + §4 错误码复用 401/403）、`ARCHITECTURE.md`（模块与数据流 + §8 决策 +1 行）、`PROJECT_STATUS.md`。

# FU-11 Store Insights 运营看板（第一期：管理端）

- 状态：approved
- 日期：2026-09-01
- 负责人：Flores
- OpenSpec 提案：[fu-11-store-insights](../../openspec/changes/fu-11-store-insights/)

## 背景 / 问题

PROJECT_STATUS Next Steps 长期挂账「store insights 运营看板（`storeInsightTool` 0 行）」。门店已积累三类业务数据，但目前**没有聚合查询能力**：

- `BehaviorLog`：RECOMMEND（`payload.movieIds`）/ BORROW_SUCCESS / BORROW_OUT_OF_STOCK / RETURN_SUCCESS，带 `movieId`、时间；FU-3 只有分页 + 筛选的明细流水查询。
- `Rental`：借出时间（`createdAt`）、归还时间（`updatedAt` + `status=RETURNED`）、影片。
- `Movie`：mood / scene / genre / 库存（`stock` / `totalStock`）。

店长想回答「什么片最火」「借阅趋势」「库存压力」「什么心情/场景被借最多」，目前只能逐条翻流水，无法形成经营结论。

决策（2026-09-01）：第一期只做**管理端运营看板**（REST 聚合接口 + `/admin/insights` 页面）；`storeInsightTool`（chat 工具）留待下一期，保持挂账。

## 目标

1. 提供一组 admin-only 聚合接口，输出可支撑经营决策的摘要指标。
2. 新增 `/admin/insights` 看板页：卡片 + 纯 CSS 条形图 + 表格呈现热门影片、借阅趋势、库存状态、mood/scene 分布、活跃概况。
3. 全部指标基于现有数据（`BehaviorLog` / `Rental` / `Movie` / `User`），**不加新表、不加埋点**。

## 范围

- **后端（apps/api）**：新增 `insightService`（聚合查询）+ admin-only 路由（`GET /api/insights/overview`，Bearer + `requireRole("admin")`）+ controller；复用现有 `authMiddleware` / `requireRole` / `validateQuery` 模式。
- **共享（packages/shared）**：新增 `insightSchemas.ts`（响应形状 + 类型，如 `storeInsightsOverview`、`popularMovieItem`、`dailyBorrowPoint`、`lowStockMovieItem`）+ 导出 + 测试。
- **前端（apps/web）**：`/admin/insights` 页面（`InsightsAdminPage`）+ admin 导航入口 + `insightApi` 客户端 + i18n（加载/错误/空态齐全）；不引图表库。
- **文档**：`API_CONTRACT.md`（新端点 + 错误码）、`ARCHITECTURE.md`（模块与数据流）、`PROJECT_STATUS.md`。

## 指标定义（第一期）

1. **热门影片 TOP N（默认 5）**：按借阅次数（`Rental` 按 `movieId` 分组）降序，展示片名、借阅数、当前是否可借（`stock > 0`）；并列展示推荐次数（`BehaviorLog` RECOMMEND 的 `payload.movieIds` 计数）。
2. **借阅趋势（最近 14 天）**：按日借出数（`Rental.createdAt` 分组）+ 按日归还数（`status=RETURNED` 的 `updatedAt` 分组），含 0 的天。
3. **库存状态**：当前 ACTIVE 借出总数、借出 / 总库存占比、低库存影片列表（阈值建议 `stock ≤ 1`，常量定义并写入契约文档）。
4. **mood / scene 分布（近 30 天）**：统计借出影片的 mood / scene 计数，各取 TOP 5，仅含有数据的维度。
5. **活跃概况**：用户总数、近 7 天活跃用户数（有行为日志的 distinct userId）、近 7 天新注册数。

接口形态：**单端点 `GET /api/insights/overview` 一次性返回全部卡片数据**（数据量小、减少请求数）；窗口参数本期用默认值，接口预留 query 参数（如 `days`）以便后续扩展。

## 非目标

- 不做 chat 工具（`storeInsightTool` 保持挂账，下一期再接入 agent）。
- 不引入图表库（recharts 等），条形图用纯 CSS 实现。
- 不加新表、不加埋点、不改行为日志/租借写入逻辑。
- 不做实时推送 / 自动轮询刷新（页面加载拉取一次；可提供手动刷新按钮）。
- 不做时间范围自定义 UI（第一期固定窗口，接口预留参数）。
- 不做用户画像维度的洞察（属画像模块职责）。
- 不做导出 CSV / 报表下载。

## 受影响模块

- `packages/shared`（`insightSchemas` + 导出 + 测试）
- `apps/api`（`insightService` + routes/controller + 测试）
- `apps/web`（`InsightsAdminPage` + 导航 + `insightApi` + i18n + 测试）
- 脊柱文档：`API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`

## 验收标准

- AC-1：admin 登录后导航含「运营看板」，`/admin/insights` 可访问；user 角色访问被路由守卫拦截（403 / 重定向）。
- AC-2：`GET /api/insights/overview`（Bearer + admin）返回 `{ code:"OK", data:{...} }`；user 角色 → 403 `FORBIDDEN`；无 token → 401 `UNAUTHORIZED`。
- AC-3：热门影片按借阅次数降序，含片名、借阅数、可借状态；无借阅数据返回空数组，页面显示空态。
- AC-4：借阅趋势返回最近 14 天每日借出/归还数，缺失日期补 0。
- AC-5：库存状态含当前借出总数、占比、低库存影片列表；阈值为契约文档标注的常量。
- AC-6：mood / scene 分布仅统计有数据的维度，各 TOP 5；空数据显示空态。
- AC-7：看板页加载态 / 错误态 / 空态齐全；所有文案走 i18n。
- AC-8：测试全绿（api：`insightService` 聚合 + 路由权限；web：`InsightsAdminPage`；shared：schema），另需 `openspec validate --all` 通过（提案创建后）。

## 待决问题

- 低库存阈值：`stock ≤ 1`（绝对量，简单可预期）vs `stock/totalStock < 20%`（相对量）——建议前者，待确认。
- 借阅趋势窗口 14 天 / mood-scene 分布窗口 30 天：是否统一成同一窗口（如统一 30 天）？
- 单端点一次返回全部 vs 按卡片拆分端点——已推荐单端点，确认后写入契约。

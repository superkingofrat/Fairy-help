## 1. Shared 契约

- [x] 1.1 新增 `packages/shared/src/schemas/insightSchemas.ts`：`storeInsightsOverview` 响应形状 + 行类型（`popularMovieItem`、`dailyBorrowPoint`、`lowStockMovieItem`、`moodSceneCount`、`activityOverview`）
- [x] 1.2 经 `packages/shared/src/schemas/index.ts` 与 `src/index.ts` 导出
- [x] 1.3 新增 `insightSchemas.test.ts`：形状与类型断言
- [x] 1.4 `pnpm --filter=@fairy/shared build` + typecheck（供 api/web 消费）

## 2. API 聚合服务

- [x] 2.1 新增 `apps/api/src/services/insightService.ts`：`getStoreInsightsOverview()` 并行聚合（热门影片 TOP 5、14 天借阅/归还趋势、库存状态、mood/scene 30 天分布、活跃概况）
- [x] 2.2 低库存阈值常量 `LOW_STOCK_THRESHOLD = 1`；推荐次数从 RECOMMEND `payload.movieIds` 统计；趋势缺日补 0（服务器本地日期分桶）
- [x] 2.3 新增 `insightService.test.ts`：mock prisma 聚合断言（含空数据、缺日补 0、TOP 排序）

## 3. API 路由

- [x] 3.1 新增 `apps/api/src/controllers/insightController.ts` + `routes/insights.ts`（`GET /`，挂 `authMiddleware` + `requireRole("admin")`）
- [x] 3.2 `app.ts` 挂载 `/api/insights`；新增 `__tests__/insights.test.ts`：admin 200 / user 403 `FORBIDDEN` / 无 token 401 `UNAUTHORIZED`

## 4. Web 看板页

- [x] 4.1 新增 `apps/web/src/lib/insightApi.ts`（`fetchInsightsOverview`，走 `request()` 认证客户端）
- [x] 4.2 新增 `components/admin/InsightsAdminPage.tsx`：卡片网格 + 纯 CSS 条形图 + 表格，加载/错误/空态齐全
- [x] 4.3 admin 导航入口 + `App.tsx` 注册 `/admin/insights` 路由
- [x] 4.4 i18n `insights.*` keys（`zh-CN.json`）
- [x] 4.5 新增 `InsightsAdminPage.test.tsx`：渲染 / 空态 / 错误态

## 5. 文档与验证

- [x] 5.1 `API_CONTRACT.md`：insights 端点 + 401/403 语义 + 低库存阈值 `stock ≤ 1` 标注
- [x] 5.2 `ARCHITECTURE.md`：模块与数据流 + §8 决策一行
- [x] 5.3 `PROJECT_STATUS.md`：FU-11 In Progress 进度更新
- [x] 5.4 验证：三包 typecheck + api/web/shared 测试全绿 + `openspec validate --all`
- [x] 5.5 真机验收：admin 看板数据正确、user 访问 403
- [x] 5.6 归档：sync `store-insights` 主 spec → move change 至 archive → validate → journal → 提交

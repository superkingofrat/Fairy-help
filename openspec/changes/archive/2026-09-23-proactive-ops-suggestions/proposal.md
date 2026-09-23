## Why

The initial product spec promised「运营仪表盘：统计借阅数据，Fairy 可主动生成运营建议」. What shipped (FU-11 admin dashboard, FU-12 `storeInsightTool` chat queries) covers only the **passive** half: an admin must remember to refresh the dashboard or think to ask in chat. There is no scheduler, no push, and no unread state anywhere in the system — a low-stock anomaly can sit unnoticed. The aggregation layer (`insightService.getStoreInsightsOverview()`: popular movies, 14-day borrow trend, inventory incl. low-stock list, mood/scene distribution, activity) and `@fairy/ai-sdk` `chat()` are both already in place; only the trigger → generate → persist → surface chain is missing. The requirement doc is approved ([docs/requirements/2026-09-23-proactive-ops-suggestions.md](../../docs/requirements/2026-09-23-proactive-ops-suggestions.md)).

## What Changes

- **db（packages/database）**：新增 `OpsSuggestion` 模型 —— `id / kind`（枚举 `LOW_STOCK|BORROW_RATIO|DORMANT|DAILY_REPORT`）/ `dedupeKey`（唯一）/ `summary` / `body` / `sourceData`（`Json` 聚合快照）/ `readAt DateTime?` / `createdAt` + `@@index([createdAt])`；一次描述性迁移 `add_ops_suggestion`；无种子变更。
- **api（apps/api）**：
  - 新增 `services/suggestionService.ts`：阈值检测（低库存沿用 `LOW_STOCK_THRESHOLD=1`、`borrowedRatio ≥ 0.8`、近 7 天零借阅冷清预警）+ 每日 08:00 本地日报合成 + `dedupeKey` 去重写入（唯一索引并发兜底）+ 查询/未读数/标记已读 + 「立即生成日报」当日幂等。
  - 新增 `routes/suggestions.ts` + 薄 controller，全部 `requireRole("admin")`：`GET /api/suggestions`（时间倒序分页）、`GET /api/suggestions/unread-count`、`PATCH /api/suggestions/:id/read`（幂等）、`POST /api/suggestions/generate-daily`（当日幂等）；错误码 401/403/404 `SUGGESTION_NOT_FOUND`，统一 `{code,data,msg}` 信封。
  - 进程内调度器（`setInterval`，零新依赖）：启动时挂载、优雅关闭清理；阈值检测周期 15 分钟、日报每日本地 08:00；单实例部署假设写入 `docs/deployment.md`，多实例以 `dedupeKey` 唯一索引兜底防重。
- **shared（packages/shared）**：`suggestionSchemas.ts` —— `suggestionSchema`（列表/详情同形）、`suggestionListFeedSchema`（`items` + `pagination`，对齐 rentals/trips 列表信封习惯）、`unreadCountSchema`）+ 类型导出 + 测试。
- **web（apps/web）**：`lib/suggestionApi.ts`（复用 `lib/http` 与 `lib/errorMessages`）；`InsightsAdminPage` 内建议流卡片（时间倒序、未读高亮、单条/全部标记已读、顶栏未读数、「立即生成」按钮、加载/错误/空态）；`locales/zh-CN.json` 全量文案。
- **AI 生成与降级**：只把真实聚合数据与影片标题注入 prompt（不含任何用户隐私字段），经 `@fairy/ai-sdk` 统一 `chat()`（供应商/模型全走 env，本功能不硬编码）转写为 Fairy 口吻经营建议；LLM 不可用（无 key/超时/报错）时**降级为模板化数据摘要**，建议照常落库，全程无 500、无未捕获错误；LLM 错误日志不打印响应负载（§5）。
- **文档**：`API_CONTRACT.md` 新增 suggestions 端点节（4 端点 + 错误码表）；`ARCHITECTURE.md` §8 决策行（进程内调度 + 单实例假设、LLM 降级模板摘要）+ §9 模块映射；`docs/deployment.md` 补调度单实例说明与 `TZ` 依赖；`PROJECT_STATUS.md`。
- **无破坏性变更**：`GET /api/insights/overview` 契约零变更（新服务只读消费其函数）；chat SSE 协议不变；`storeInsightTool` 不读建议库（对话侧联动本期不做）；既有依赖表无 alter。

## Capabilities

### New Capabilities

- `ops-suggestions`: 主动运营建议 —— 阈值触发（低库存/借出率/零借阅冷清）与每日本地 08:00 日报的定时生成、基于真实聚合数据的 LLM 建议生成与失败降级、`dedupeKey` 去重防轰炸、admin-only 的建议流（列表/未读数/标记已读/立即生成当日幂等）、进程内单实例调度与多实例唯一索引兜底。

### Modified Capabilities

（无 —— `store-insights` 的 `GET /api/insights/overview` 契约与本功能的行为形态均不变；新服务只读复用其聚合函数，属实现细节）

## Impact

- 公共契约新增 4 个 admin-only REST 端点（`GET /api/suggestions`、`GET /api/suggestions/unread-count`、`PATCH /api/suggestions/:id/read`、`POST /api/suggestions/generate-daily`）；共享 schema 经 `packages/shared`；SSE 协议不变。
- 数据库新增一次迁移（`add_ops_suggestion`，只增表不改既有表）；`dedupeKey` 唯一索引是并发防重与去重语义的唯一事实来源。
- 新增运行时依赖：无（调度 `setInterval`、AI 走既有 `@fairy/ai-sdk`）；部署新增约束：`TZ=Asia/Shanghai`（对齐 `localMidnight`/08:00 口径）与单实例运行假设（多实例靠唯一索引兜底，仅可能丢触发不重发）。
- 测试：shared schema 三件套；api service（三类阈值、去重、日报幂等、LLM 失败降级、分页/已读）+ 路由门禁矩阵 + 调度器（注入时钟，不打真等待）；web（建议流三态、未读数、标记已读、立即生成）；全程 mock DB/LLM/时钟，不碰真实库与供应商。
- 真机验收覆盖：改库触发低库存建议落库与未读数、去重恢复语义、立即生成幂等、无 key 降级为模板摘要、契约门禁矩阵、隐私字段断言。

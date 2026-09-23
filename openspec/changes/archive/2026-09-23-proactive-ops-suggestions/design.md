## Context

- `insightService.getStoreInsightsOverview(now?)`（`services/insightService.ts`）已产出只读聚合快照（popularMovies / 14 天 trend / inventory 含 lowStockMovies + borrowedRatio / moods / scenes / activity），并导出契约常量 `LOW_STOCK_THRESHOLD=1`、`TREND_DAYS=14`、`DISTRIBUTION_DAYS=30`、`ACTIVITY_DAYS=7` 与本地日助手 `toLocalDateKey` / `localMidnight`。本服务**只读消费**该函数，不改其契约（`GET /api/insights/overview` 零变更）。
- LLM 统一入口是 `agent/llmClient.ts` 的 `tryChat(source, messages, options)`：无 key 或失败返回 `null`，内部 `logProviderWarn` 只记 `{source, code, provider}`、**不打印响应负载**（§5 已满足）；用量走 `recordUsage`。`planTripTool` / `memoryExtractor` 均走此入口，本服务不另造 LLM 管道。
- Admin 门禁既有模式：`routes/insights.ts` 用 `requireRole("admin")`（`middleware/auth.ts`），非 admin 403 `FORBIDDEN`、无凭证 401 `UNAUTHORIZED`；`app.ts` 以 `app.use("/api/<name>", authMiddleware, router)` 挂载。列表信封既有惯例（behaviorLogs / memories / trips）：`{ items, pagination: { page, limit, total, totalPages } }`。
- 约束（AGENTS）：统一 `{code,data,msg}` 信封；共享 schema 只在 `packages/shared` 一处声明；密钥只走 env（本功能不新增 env——复用 `AI_PROVIDER`/各供应商 key）；`ops_suggestions` 为纯新增表，无既有表 alter。

## Goals / Non-Goals

**Goals:**

- 触发/生成/落库/建议流四环全部闭环，且任何一步失败都不影响主链路与看板（§0 降级哲学）。
- 去重与幂等语义可测：单测注入时钟与 mock DB 驱动，真机只做抽查。
- 建议内容 100% 由真实聚合数据支撑：prompt 注入即全部事实，模板降级也是同一份数据的渲染。

**Non-Goals:**

- 不做对话侧联动（chat/`storeInsightTool` 不读建议库）、不做站外推送、不做自动执行动作（见 proposal）。
- 不做分布式调度（node-cron / pg_cron / 外部 cron）、不做建议编辑删除与「有用/没用」反馈。
- 不引入部分唯一索引等 Prisma 未建模的原生索引技巧——dedupe 语义用「`dedupeKey` 唯一 + 恢复即清理」表达（见决策 2）。

## Decisions

### 1. 调度：进程内 `setInterval`（零新依赖），挂 server 入口而非 `createApp()`

`services/suggestionScheduler.ts` 暴露 `startScheduler(options)`（返回 stop 句柄）与纯函数 `shouldRunThresholdCycle(now, lastCycleAt)` / `shouldRunDaily(now, lastDailyDateKey)`（本地 08:00 判定用 `localMidnight`/`toLocalDateKey` 同口径，保证可注入测试）。周期：阈值检测每 15 分钟、启动时立即跑一次（dev 验收改库后重启 api 即触发，不必空等）；日报每 tick 检查「今天是否已有 `DAILY_REPORT`」（查库判定而非内存状态——重启/换进程依然幂等）。挂载点选 `apps/api/src/index.ts`（server entry）而非 `app.ts`：`createApp()` 是测试隔离工厂（限流器同理在其中创建），调度副作用不应进入它；SIGTERM 优雅关闭时 `stop()` 定时器，且每 tick 自包裹 try/catch——单 tick 失败只记日志不中断后续周期。
**理由**：零新依赖；单实例是本期部署假设（写 `docs/deployment.md`）；查询型判定（非内存）让多实例与重启行为自动幂等。
**备选（否决）**：`node-cron`——为两个固定周期引一个依赖，与 ai-sdk「纯 fetch 零依赖」取向相反；外部 cron 打 `generate-daily` 端点——只覆盖日报不覆盖阈值检测，仍需进程内兜底，双轨更复杂；pg_cron——需 Neon 侧配置且绕过应用统一错误处理。

### 2. 去重：`dedupeKey` 唯一索引 + 「恢复即清理」，并发靠 create 冲突兜底

`dedupeKey` 取值：`LOW_STOCK:<movieId>`（每部低库存影片一条）、`BORROW_RATIO:store`、`DORMANT:store`、`DAILY_REPORT:<localDateKey>`。检测周期产出一道「当前命中的活跃 key 集合」，然后：

- **写入**：对每个活跃 key，`create`；若同 key 建议仍在（异常未恢复）→ skip（不打扰已读状态）。并发下两实例同时 create，唯一索引使一方抛 P2002 → catch 后按「已存在」跳过。
- **恢复清理**：`deleteMany` 掉 `kind ∈ {LOW_STOCK}` 且 `dedupeKey` 不在活跃集合内的未恢复建议；`BORROW_RATIO` / `DORMANT` 在阈值回落时删除对应 key。
- **日报**：`DAILY_REPORT:<dateKey>` 天然当日唯一；`generate-daily` 与定时器同路径，P2002 → 返回当日既有建议（幂等）。

「回补后再跌破生成新的一条」因此是自然的：恢复清理删掉旧行，再触发时 create 出一条全新记录（含新 `createdAt` 与未读态）。模型列与需求文档完全一致（`id/kind/dedupeKey/summary/body/sourceData/readAt/createdAt`，`dedupeKey` 上有唯一索引、`createdAt` 普通索引）。
**理由**：唯一索引是去重语义的唯一事实来源（数据库兜底，不依赖进程内存）；「恢复即删除」让建议流只呈现当前值得关注的异常 + 历史日报，不留已恢复噪音，也避免引入 Prisma 未建模的部分唯一索引。
**备选（否决）**：`resolvedAt` 软关闭 + 部分唯一索引（`WHERE resolved_at IS NULL`）——保留审计但 Prisma 无法声明该索引、冲突映射依赖原生行为，复杂度和不确定性与收益不匹配；纯内存去重——重启即重报，且多实例必然重复。

### 3. 阈值集合：与看板口径严格一致，宁少勿噪

`LOW_STOCK`：`stock <= LOW_STOCK_THRESHOLD`（复用导出常量，与看板低库存名单同源）；`BORROW_RATIO`：`inventory.borrowedRatio >= 0.8`；`DORMANT`：`trend` 最近 7 天（含今天）借阅总和为 0。不做借阅骤降等趋势类阈值——样本小（dev 库）易噪，违背「宁少勿噪」。常量集中在 `suggestionService.ts` 导出（`BORROW_RATIO_THRESHOLD`、`DORMANT_DAYS`、`DETECTION_INTERVAL_MINUTES=15`、`DAILY_HOUR=8`），与 `insightService` 常量风格一致。

### 4. 生成：`tryChat` + 数据快照 prompt，失败即模板降级

prompt 只注入**本轮真实聚合数据的精简 JSON**（低库存名单、借出率、近 7 天借还、热门 top5、心情场景 top5、活跃度）与系统约束（Fairy 口吻、只用给定数据、不得编造影片或数字、≤300 字、2–4 条要点）；`tryChat("agent.suggestion", messages, { maxTokens: 800, temperature: 0.4 })` 返回 null（无 key/超时/报错）→ `renderTemplateSuggestion(kind, snapshot)` 纯函数渲染模板摘要（中文文案直接写在 api 侧，与 `app.ts` 限流 msg 等既有中文硬编码一致；web UI 文案走 locales）。LLM 正文与模板摘要都只从同一 snapshot 取值——AC-4 的「数据一致」因此可断言。阈值类建议一次生成一条（kind 固定）；日报一次一条 `DAILY_REPORT`。
**理由**：`tryChat` 已封装 key 探测、错误静默、usage 记录，复用即满足 §5 全部条款（错误日志无负载）。

### 5. body 格式：纯文本（Markdown 子集），前端 `whitespace-pre-line`

body 为多行纯文本（模板用「· 」要点、LLM 输出约定 2–4 行要点），web 侧 `whitespace-pre-line` 渲染，不引 Markdown 库；`summary` 单行标题。JSON `sourceData` 存快照供审计与降级核对，不在 UI 渲染（避免把内部结构暴露给页面）。

### 6. 端点面：4 个 admin-only 端点，「全部已读」前端串行 PATCH

`GET /api/suggestions`（`page/limit` 查询，createdAt desc）、`GET /api/suggestions/unread-count`、`PATCH /api/suggestions/:id/read`（幂等）、`POST /api/suggestions/generate-daily`（当日幂等）。**不设** read-all 端点，也不设阈值检测的手动端点——前端「全部已读」对当页未读项串行 PATCH（每页 ≤20，可接受）；AC-1 的阈值真机验收靠「改库 → 重启 api（启动即跑一次检测）→ 观察建议流」，单测直推 service 层覆盖判定逻辑。
**理由**：端点面与需求批准范围（4 端点）严格一致；手动入口只保留日报一个（演示/验收价值最高），阈值检测加手动端点会诱导「把持续状态当告警刷」。

### 7. Web：建议流内嵌 `InsightsAdminPage`

`lib/suggestionApi.ts`（复用 `lib/http` + `lib/errorMessages` 错误码归一化）+ `components/admin/SuggestionFeed.tsx`（列表/未读徽标/单条与全部已读/立即生成按钮/三态），`InsightsAdminPage` 顶部加未读徽标与卡片槽位；文案 `locales/zh-CN.json`。渲染层只消费 `suggestionSchema` 形状（kind/summary/body/readAt/createdAt），kind 映射中文标签。

## Risks / Trade-offs

- **`TZ` 未设为 `Asia/Shanghai`** → 08:00 日报与本地日边界漂移（与 Risks 既有「洞察窗口依赖服务器时区」同根）。→ 部署文档明示 + 容器 `TZ=Asia/Shanghai`（批次 7 Dockerfile 已设）；scheduler 启动时 `process.env.TZ` 缺失记一次 warn（不含任何密钥）。
- **多实例部署漏触发**（某实例没轮到 tick）→ 唯一索引兜底防重；漏触发仅在「只有另一实例该跑却没跑」时发生，可接受；文档写明单实例假设与多实例语义（不重发、可能 missed）。
- **LLM 编造数字/影片** → prompt 只给快照 + 显式禁令；AC-4 断言正文字号与片名 ⊆ snapshot。
- **15 分钟检测周期内的低库存延迟** → 非实时告警定位，日报与看板仍提供即时视角；文档注明。
- **恢复即删除丢失历史** → 建议流定位「当前异常 + 日报」；日报 body 含当日低库存名单，历史可回溯。
- **dev 库被建议写入污染** → 属正常业务数据（同 behaviorLogs），无需特殊处理；真机验收断言后保留。

## Migration Plan

- `pnpm --filter=@fairy/database migrate:dev --name add_ops_suggestion`（或等价命令）生成一次迁移：新建 `ops_suggestions` 表 + `SuggestionKind` 枚举 + 唯一索引（注释说明 dedupe 语义）与 `createdAt` 索引；无既有表 alter、无种子变更。
- 回滚：去掉 `app.ts` 挂载与 scheduler 启动即可，功能静默消失；`ops_suggestions` 表可留可删（无外键依赖）。
- 部署新增两项约束写入 `docs/deployment.md`：`TZ=Asia/Shanghai`（同既有洞察窗口要求）与单实例运行假设（或多实例下唯一索引兜底语义）。

## Open Questions

（无——需求文档 5 项待决问题已全部在本设计定稿：调度=进程内 setInterval；阈值=低库存(1)/借出率(0.8)/7 天零借阅；body=纯文本；立即生成仅日报端点；未读覆盖全部四类。）

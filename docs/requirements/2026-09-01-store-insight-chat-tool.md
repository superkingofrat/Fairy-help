# FU-12 storeInsightTool chat 工具（第二期：对话问数）

- 状态：approved
- 日期：2026-09-01
- 负责人：Flores
- 前置：FU-11 运营洞察看板（第一期：管理端）已交付并归档（[2026-09-01-store-insights.md](./2026-09-01-store-insights.md)）

## 背景 / 问题

FU-11 已交付 admin-only 聚合接口 `GET /api/insights/overview` + `/admin/insights` 看板页，`apps/api/src/tools/storeInsightTool.ts` 仍是 0 行占位。店长要查看经营数据必须打开看板页；但很多问法天然是对话式的——「最近什么片最火」「库存压力大不大」「这几天借阅怎么样」——目前 chat 只支持推荐/借阅/归还，答不了经营问题。

本期把 `storeInsightTool` 接入 agent 链路（意图 → 规划 → 分发 → 合成），让管理员直接在对话中问店内数据，复用 FU-11 已交付的聚合服务，**不新增聚合逻辑**。

## 目标

1. 管理员在 chat 中提问店内运营数据（热门影片 / 借阅趋势 / 库存状态 / mood-scene 分布 / 活跃概况），得到基于真实数据的自然语言回复。
2. 非 admin 触发该能力时给出友好拒绝，不暴露权限细节或内部错误。
3. 全部数据来自 FU-11 `insightService.getStoreInsightsOverview()`（不加表、不加埋点、不改窗口与阈值常量）。

## 范围

- **后端（apps/api）**：
  - 实现 `tools/storeInsightTool.ts`：输入 `topic`（可选），调用 `insightService.getStoreInsightsOverview()`，按 topic 返回对应切片。
  - `agent/intentClassifier.ts`：LLM intent 枚举新增 `store_insight` + 提示词规则（口语映射：最火/热门/店况/库存/借阅趋势/运营/看板等）；规则兜底关键词同源；提取可选 `topic`（`popular` / `trend` / `inventory` / `mood_scene` / `activity` / `overview` 默认）。
  - `agent/planner.ts`：`PlannedCall` 新增 `{ tool: "insight"; topic }` 分支。
  - `agent/toolDispatcher.ts`：新增 `kind: "insight"` observation；**admin 门禁**（非 admin → 拒绝 observation）。
  - `agent/responseSynthesizer.ts`：insight 分支——按 topic 构造【事实】→ LLM 生成回复（兜底模板）；非 admin 拒绝文案。
  - `agent/stateLoop.ts` + `routes/chat.ts`：把 `res.locals.role` 穿进 `runChatTurn` → `dispatch`（签名新增 `role` 参数）。
  - 测试：intentClassifier（识别 + topic）、planner、toolDispatcher（admin 放行 / user 拒绝）、responseSynthesizer（各 topic 文案 + 拒绝）、stateLoop 集成。
- **共享（packages/shared）**：新增 `insightTopicSchema`（zod enum + 类型）+ 导出 + 测试（保持一致性和复用）。
- **文档**：`docs/tools.md`（工具注册表填充 storeInsightTool + 既有工具）、`ARCHITECTURE.md`（agent 流程 + §9 映射）、`PROJECT_STATUS.md`。

## 非目标

- 不做 insight 卡片 SSE 事件（本期纯文本回复；结构化卡片看板页已覆盖）。
- 不改 `insightService` / `insightSchemas` 已有形状，不加新聚合指标。
- 不加新表、不加行为日志埋点（查询只读，不写 `BehaviorLog`）。
- 不改 REST `/api/insights`（FU-11 已交付）。
- 不做时间范围自定义对话（沿用服务默认窗口：趋势 14 天、分布 30 天、活跃 7 天、低库存 `stock ≤ 1`）。
- 不做 web 前端改动（chat 前端复用现有文本渲染）。

## 受影响模块

- `packages/shared`（`insightTopicSchema` + 导出 + 测试）
- `apps/api`（`tools/storeInsightTool`、`agent/intentClassifier`、`planner`、`toolDispatcher`、`responseSynthesizer`、`stateLoop`、`routes/chat` + 测试）
- 文档：`docs/tools.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`

## 验收标准

- AC-1：admin 在 chat 问「最近什么片最火」→ 回复含热门影片与借阅数（数据来自 `overview.popularMovies`）。
- AC-2：问「库存怎么样」→ 回复含当前借出 / 占比 / 低库存影片（`overview.inventoryStatus`）；无低库存数据时给出空态友好文案。
- AC-3：趋势 / mood-scene / 活跃主题均有对应回复（topic 切片正确）；无 topic 时默认 overview 摘要。
- AC-4：非 admin 问店内数据 → 友好拒绝（「该功能仅管理员可用」），不暴露堆栈/权限细节，SSE 正常 `done`。
- AC-5：口语识别（「店况」「运营」「最火」「库存」等）落到 `store_insight`，不误判为 chitchat / recommend。
- AC-6：测试全绿：api（intentClassifier / planner / toolDispatcher / responseSynthesizer / stateLoop）+ shared（topic schema）+ typecheck。
- AC-7：真机验收：admin chat 提问回复正确（数据与看板页一致）；user chat 提问拒绝文案；Trellis task 评审通过。

## 待决问题

- **轨道选择**：Trellis 轨（单 app + shared 增量、不改 HTTP 契约与 SSE 事件形状）vs OpenSpec 轨——建议 **Trellis 轨**，待确认。
- **topic 粒度**：意图里提取 topic（回复聚焦、省 token）vs 永远返回完整 overview 让合成器自选——建议**带 topic，默认 overview**。
- **非 admin 触发**：明确拒绝文案（推荐，答案可预期）vs 静默降级 chitchat（可能答非所问）。
- **role 传递方式**：`runChatTurn`/`dispatch` 新增 `role` 参数（改动面小、与现有签名一致、测试好写）vs controller 前置拦截——建议前者。

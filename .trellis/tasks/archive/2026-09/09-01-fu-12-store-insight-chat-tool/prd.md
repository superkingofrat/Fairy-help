# FU-12: storeInsightTool chat 工具（对话问数）

## Goal

把 storeInsightTool 接入 agent 链路（intent → plan → dispatch → synthesize）：管理员可在 chat 直接问店内运营数据（热门影片/借阅趋势/库存状态/mood-scene 分布/活跃概况），复用 FU-11 insightService.getStoreInsightsOverview() 按 topic 切片；非 admin 友好拒绝；不改 HTTP/SSE 契约。apps/api + shared 增量（insightTopicSchema）。需求：docs/requirements/2026-09-01-store-insight-chat-tool.md（已批准，AC-1~AC-7）

## Requirements

- 实现 `apps/api/src/tools/storeInsightTool.ts`：输入 topic（可选），复用 `insightService.getStoreInsightsOverview()`，按 topic 返回对应切片；不改 aggregation 逻辑与窗口/阈值常量。
- `intentClassifier`：LLM intent 枚举新增 `store_insight`（提示词口语映射：最火/热门/店况/库存/借阅趋势/运营/看板等）；规则兜底关键词同源；提取可选 topic（`popular`/`trend`/`inventory`/`mood_scene`/`activity`/`overview` 默认）。
- `planner`：`PlannedCall` 新增 `{ tool: "insight"; topic }` 分支。
- `toolDispatcher`：新增 `kind: "insight"` observation；admin 门禁（非 admin → 拒绝 observation）。
- `responseSynthesizer`：insight 分支按 topic 构造【事实】→ LLM 生成回复（兜底模板）；非 admin 拒绝文案，不暴露权限细节/堆栈。
- role 传递：`routes/chat.ts` 把 `res.locals.role` 穿进 `runChatTurn` → `dispatch`（签名新增 `role` 参数）。
- shared：新增 `insightTopicSchema`（zod enum + 类型）+ 导出 + 测试。
- 文档：`docs/tools.md`（工具注册表）、`ARCHITECTURE.md`（agent 流程 + §9 映射）、`PROJECT_STATUS.md`。

## Acceptance Criteria

- [ ] AC-1 admin 问「最近什么片最火」→ 回复含热门影片与借阅数（数据来自 `overview.popularMovies`）。
- [ ] AC-2 问「库存怎么样」→ 回复含当前借出/占比/低库存影片（`overview.inventoryStatus`）；无低库存时空态友好文案。
- [ ] AC-3 趋势 / mood-scene / 活跃主题均有对应回复（topic 切片正确）；无 topic 默认 overview 摘要。
- [ ] AC-4 非 admin 问店内数据 → 友好拒绝（「该功能仅管理员可用」），不暴露堆栈/权限细节，SSE 正常 `done`。
- [ ] AC-5 口语识别（「店况」「运营」「最火」「库存」等）落到 `store_insight`，不误判 chitchat / recommend。
- [ ] AC-6 测试全绿：api（intentClassifier / planner / toolDispatcher / responseSynthesizer / stateLoop）+ shared（topic schema）+ typecheck。
- [ ] AC-7 真机验收：admin chat 提问回复正确（数据与看板页一致）；user chat 提问拒绝文案；Trellis task 评审通过。

## Notes

- 不改 HTTP 契约（API_CONTRACT 无需新增端点）与 SSE 事件形状（纯文本回复，不做 insight 卡片）。
- 复用 `res.locals.role`（authMiddleware 已写入），不新增鉴权中间件。

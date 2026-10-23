# 工具注册表（Tool Registry）

Fairy 智能体可调用的业务工具定义。工具由 `classifyIntent → plan → dispatch` 链路选择与执行，
执行结果以 `ToolObservation` 注入上下文，最终由 `responseSynthesizer` 生成自然语言回复。
所有工具均只读业务数据或执行一次原子操作，**不直接输出给用户**（工具使用权限见 AGENTS §0）。

## 工具清单

| 工具               | 源码                                       | 触发意图        | 参数                          | 权限         | 说明                                                                                                                                                                      |
| ------------------ | ------------------------------------------ | --------------- | ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| recommendMovieTool | `apps/api/src/tools/recommendMovieTool.ts` | `recommend`     | `moods` / `scenes` / 片名约束 | 登录用户     | 按画像与情绪/场景推荐影片，返回候选片单                                                                                                                                   |
| borrowMovieTool    | `apps/api/src/tools/borrowMovieTool.ts`    | `borrow`        | `movieTitle`                  | 登录用户     | 借出影片；库存为 0 或租期冲突时返回失败原因                                                                                                                               |
| returnMovieTool    | `apps/api/src/tools/returnMovieTool.ts`    | `return`        | `movieTitle`                  | 登录用户     | 归还影片；校验租约存在与状态                                                                                                                                              |
| planTripTool       | `apps/api/src/tools/planTripTool.ts`       | `trip`          | 出行意图参数                  | 登录用户     | 旅行规划（接入外部出行/地图能力，见 services/amapClient）；按 `Profile.name` 精确命中同行人画像并注入 prompt（FU-20）                                                     |
| storeInsightTool   | `apps/api/src/tools/storeInsightTool.ts`   | `store_insight` | 无（零参）                    | **仅 admin** | 聚合门店运营看板（热门/趋势/库存/分布/活跃），复用 `insightService.getStoreInsightsOverview()`；非 admin 在 dispatch 层直接拒绝（`code: FORBIDDEN`），不调用工具（FU-12） |

## 执行链路

```
user 消息 → intentClassifier（LLM + 规则兜底）→ planner → dispatch(plan, userId, role)
          → 工具执行 → ToolObservation → responseSynthesizer → SSE text 事件
```

- 权限门禁统一放在 `toolDispatcher.dispatch()`：运营类工具（storeInsightTool）先校验 `role === "admin"`，
  未通过时不发起工具调用，直接产出 `{ success: false, forbidden: true, code: "FORBIDDEN" }` 观察值。
- 行程规划按 `role ∈ {admin, agent}` 门禁（不按画像名），未通过时不调用 `planTripTool`、不落库、不发 `trip` 事件；
  `planTripTool` 在消毒后消息里按 `Profile.name` 精确匹配除本人外的画像候选，命中的同行人偏好（旅行风格/
  风格标签/饮食偏好/忌口，只拼非空字段）注入 LLM prompt，未命中/候选查询失败/画像全空时降级为无同行人
  （prompt 与不带同行人时逐字一致），`TRIP_PLANNED` 日志增记 `companionName`/`companionUserId`（FU-20，
  详见 ARCHITECTURE §8 决策行）。偏好注入后在提示词里是**约束**而非「参考」——须落实在选点上
  （忌口/高标准餐饮就避开路边摊），`note` 只写时间/预约/排队等执行信息（2026-10-11 修复）；
  草稿预算 `TRIP_DRAFT_MAX_TOKENS = 4000`，回复层另按 `TRIP_REPLY_MAX_TOKENS = 600` 概括呈现。
- 工具失败（如聚合异常）不向用户暴露堆栈，由 synthesizer 降级为友好文案（如 `INSIGHT_UNAVAILABLE` → “店内数据这会儿拉取失败了”）。
- 新增工具须在本表登记，并同步更新 `docs/requirements/` 与 `ARCHITECTURE.md` §5（数据流）。

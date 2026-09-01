# 工具注册表（Tool Registry）

Fairy 智能体可调用的业务工具定义。工具由 `classifyIntent → plan → dispatch` 链路选择与执行，
执行结果以 `ToolObservation` 注入上下文，最终由 `responseSynthesizer` 生成自然语言回复。
所有工具均只读业务数据或执行一次原子操作，**不直接输出给用户**（工具使用权限见 AGENTS §0）。

## 工具清单

| 工具 | 源码 | 触发意图 | 参数 | 权限 | 说明 |
|---|---|---|---|---|---|
| recommendMovieTool | `apps/api/src/tools/recommendMovieTool.ts` | `recommend` | `moods` / `scenes` / 片名约束 | 登录用户 | 按画像与情绪/场景推荐影片，返回候选片单 |
| borrowMovieTool | `apps/api/src/tools/borrowMovieTool.ts` | `borrow` | `movieTitle` | 登录用户 | 借出影片；库存为 0 或租期冲突时返回失败原因 |
| returnMovieTool | `apps/api/src/tools/returnMovieTool.ts` | `return` | `movieTitle` | 登录用户 | 归还影片；校验租约存在与状态 |
| planTripTool | `apps/api/src/tools/planTripTool.ts` | `trip` | 出行意图参数 | 登录用户 | 旅行规划（接入外部出行/地图能力，见 services/amapClient） |
| storeInsightTool | `apps/api/src/tools/storeInsightTool.ts` | `store_insight` | 无（零参） | **仅 admin** | 聚合门店运营看板（热门/趋势/库存/分布/活跃），复用 `insightService.getStoreInsightsOverview()`；非 admin 在 dispatch 层直接拒绝（`code: FORBIDDEN`），不调用工具（FU-12） |

## 执行链路

```
user 消息 → intentClassifier（LLM + 规则兜底）→ planner → dispatch(plan, userId, role)
          → 工具执行 → ToolObservation → responseSynthesizer → SSE text 事件
```

- 权限门禁统一放在 `toolDispatcher.dispatch()`：运营类工具（storeInsightTool）先校验 `role === "admin"`，
  未通过时不发起工具调用，直接产出 `{ success: false, forbidden: true, code: "FORBIDDEN" }` 观察值。
- 工具失败（如聚合异常）不向用户暴露堆栈，由 synthesizer 降级为友好文案（如 `INSIGHT_UNAVAILABLE` → “店内数据这会儿拉取失败了”）。
- 新增工具须在本表登记，并同步更新 `docs/requirements/` 与 `ARCHITECTURE.md` §5（数据流）。

# FU-12 design — storeInsightTool 接入 agent 链路

## 现状（已核对源码）

- agent 链：`intentClassifier.classifyIntent` → `planner.plan(intent)` → `toolDispatcher.dispatch(plan, userId)` → `responseSynthesizer.synthesize(observation, context)`。
- `PlannedCall`：`recommend | borrow | return | none`；`ToolObservation`：`recommend | borrow | return | none`。
- `runChatTurn(input: { userId, message, movieId?, action?, history? })`：chat route 在 SSE 前解析 session，`res.locals.userId`/`res.locals.role` 已由 authMiddleware 写入（`res.locals.role` 当前未被 agent 链消费）。
- FU-11 `insightService.getStoreInsightsOverview(now?)` 返回 `StoreInsightsOverview`（popularMovies / trend / inventoryStatus / moods / scenes / activity），已含全部指标。
- SSE 事件类型：`text | recommendation | borrow | return | done`（`@fairy/shared` chatSchemas）。本期不加新事件，只用 `text`。

## 设计

### 1. shared：`insightTopicSchema`

`packages/shared/src/schemas/insightSchemas.ts` 追加：

```ts
export const INSIGHT_TOPICS = ["popular", "trend", "inventory", "mood_scene", "activity", "overview"] as const;
export const insightTopicSchema = z.enum(INSIGHT_TOPICS);
export type InsightTopic = z.infer<typeof insightTopicSchema>;
```

经 `schemas/index.ts` 与 `src/index.ts` 导出；`insightSchemas.test.ts` 追加类型/取值断言。

### 2. `tools/storeInsightTool.ts`

```ts
export async function storeInsightTool(input: {
  topic: InsightTopic;
}): Promise<{ success: boolean; data?: StoreInsightsOverview; error?: string }>
```

实现：调用 `insightService.getStoreInsightsOverview()`，`success: true` + 完整 overview（切片在 synthesizer 侧做，工具保持简单、返回全量，复用 FU-11 单端点"一次返回全部"的既有决策）。错误 `success: false, error: "INSIGHT_UNAVAILABLE"`。

### 3. `intentClassifier`

- `ChatIntent` 新增 `{ type: "store_insight"; topic: InsightTopic }`（topic 默认 `"overview"`）。
- LLM：JSON 枚举 `borrow|return|recommend|store_insight|chitchat`；`store_insight` 时 `topic` 字段从 `popular|trend|inventory|mood_scene|activity|overview` 选（口语映射：最火/热门→popular；趋势/最近→trend；库存/缺货→inventory；心情/场景/分布→mood_scene；活跃/用户→activity；店况/运营/数据/看板→overview；拿不准填 overview）。注意：用户**借某部片**优先 borrow（规则"含借字+唯一片名"在 LLM 之前？否——LLM 先跑；提示词明确"涉及具体片名→borrow"）。
- 规则兜底（`classifyIntentByRules`，LLM 失败/降级路径）：关键词命中 `最火|热门|库存|缺货|趋势|店况|运营|数据|看板|活跃|借阅情况` 且**不含** mood/scene 枚举（避免与 recommend 冲突）→ `store_insight` + 对应 topic 映射。
- 优先序：`store_insight` 规则检查放在 mood/scene recommend 之前（「库存最火的片」这类混合问法归 insight）；具体片名借阅仍在前面（含"借"+唯一片名）。

### 4. `planner`

`PlannedCall` 新增 `{ tool: "insight"; topic: InsightTopic }`；`plan()` 对 `intent.type === "store_insight"` 返回该分支。

### 5. `toolDispatcher`

- `dispatch(plan, userId, role)`（新增 `role: Role` 参数）。
- `plan.tool === "insight"` 时：
  - `role !== "admin"` → `{ kind: "insight", success: false, forbidden: true, topic, overview: null }`（不调用工具，避免泄露数据）。
  - admin → `storeInsightTool({ topic })` → `{ kind: "insight", success, topic, overview, code }`。
- `ToolObservation` 新增 `kind: "insight"` 变体。

### 6. `stateLoop.runChatTurn`

`input` 新增 `role?: Role`（默认 `"user"` 保守）；透传 `dispatch(planned, userId, role)`。chat route：`runChatTurn({ ..., role: res.locals.role as Role })`。

### 7. `responseSynthesizer`

`observation.kind === "insight"` 分支：

- 非 admin（`forbidden`）→ 模板「这个功能目前只对门店管理员开放哦。」+ facts「用户（非管理员）询问店内运营数据，拒绝。不得透露任何数据。」→ LLM 生成（兜底模板）。
- admin 成功：按 `topic` 构造【事实】字符串：
  - `popular`：`overview.popularMovies`（片名 + 借阅数 + 可借状态）前 5。
  - `trend`：`overview.trend`（近 14 天借出/归还，含 0 补全），给最近几日与合计。
  - `inventory`：`overview.inventoryStatus`（available / outOfStock / borrowedRatio / lowStock 列表）。
  - `mood_scene`：`overview.moods` / `overview.scenes` 各 TOP 5。
  - `activity`：`overview.activity`（totalUsers / activeUsers7d / newUsers7d / borrows7d）。
  - `overview`（默认）：上述各节浓缩摘要。
  - 空数据 → 空态友好文案（「还没有足够的借阅数据」等）。
- 返回 `{ texts: [...] }`，无结构化事件。

## 测试计划

- shared：`insightTopicSchema` 取值/拒绝断言。
- intentClassifier：`store_insight` 规则兜底（各关键词 → topic）；不误判（「借《xxx》」仍 borrow；mood 词 → recommend）。
- planner：insight intent → `{ tool: "insight", topic }`。
- toolDispatcher：admin → insight observation（mock storeInsightTool）；user → forbidden observation（不调用工具）。
- responseSynthesizer：各 topic facts 文案（mock tryChat 走兜底模板断言关键词）；forbidden 文案；空数据文案。
- stateLoop 集成：role 透传（admin 问库存 → insight；user 问 → 拒绝）。

## 风险

- LLM 意图把「最火的片推荐给我」判成 recommend（含"推荐"）：提示词里明确 store_insight 优先于 recommend 当消息含运营词；规则兜底兜住。
- 数据量大 token 溢出：facts 只取 TOP 5/合计，不做全量。

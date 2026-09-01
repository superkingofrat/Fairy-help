## Why

旅行规划自 MVP 起挂账：`apps/api/src/services/amapClient.ts`、`apps/api/src/tools/planTripTool.ts`、`apps/api/src/controllers/tripController.ts` 为 0 字节占位，`routes/trips.ts` 是未挂载的 9 行占位，前端 `TripTimeline.tsx` 是占位组件；agent 链（intent → plan → dispatch → synthesize）、共享契约、Prisma `Trip` 模型完全缺失。用户说「帮我规划周末去杭州玩」目前只能得到闲聊/推荐回复。需求文档已批准（[docs/requirements/2026-09-01-travel-planning.md](../../docs/requirements/2026-09-01-travel-planning.md)），本期交付**第一期：chat 内对话行程生成**；REST `POST /api/trips`、地图叠加、多城市/酒店/日期计算为二期非目标。

## What Changes

- **数据库（packages/database）**：新增 `Trip` 模型（`userId`、`destination`、`days`、`itinerary` Json、`route` Json?、`status` 枚举 `DRAFT`）+ 迁移；`BehaviorAction` 追加 `TRIP_PLANNED`（追加式，不动既有值）。
- **共享（packages/shared）**：新增 `tripSchemas.ts`（`tripPoi`/`itineraryDay`/`routeLeg`/`tripResult`/`tripEvent`）；`chatEventSchema` 追加 `trip` 事件成员；导出 + 测试。
- **后端（apps/api）**：
  - `services/amapClient.ts`：服务端高德 Web 服务 API 封装（POI 文本搜索 + 路线规划），读 `AMAP_SERVER_KEY`（**可选**，缺失/报错 → 降级信号，不崩不暴露密钥）。
  - `tools/planTripTool.ts`：读画像 `travelStyle` + 消息 → LLM 生成行程草稿（`tryChat("agent.trip")`，source 新键）→ amapClient 逐一校验 POI 坐标/城市并规划相邻 POI 路线 → 事务内落库 `Trip` + `TRIP_PLANNED` 行为日志 → `{ success, data, error }`；目的地缺失/草稿失败 → `{ unresolved: true }` 不落库。
  - agent 链：`intentClassifier` 新增 `plan_trip`（LLM 枚举 + 提示词；规则兜底**先于 LLM**：`旅行|出游|行程|规划|想去|旅游|去…玩|周末去哪` 等，与 FU-12 store_insight 同一确定性模式）；`planner` 映射 `{ tool: "trip" }`；`dispatch` 新增 `kind: "trip"` observation 并透传 `message`（stateLoop 已有）；`responseSynthesizer` trip 分支（成功行程摘要 / unresolved 追问目的地 / 失败降级文案）；`routes/chat.ts` SSE 输出 `trip` 事件（追加式，不改既有事件）。
- **前端（apps/web）**：`TripTimeline.tsx` 真实实现（目的地 + 天数分组 + POI 步骤（时间/名称/类别/备注）+ 校验徽标 + 路线摘要），ChatPage 渲染实时 `trip` 事件与会话回放 payload 中的 `trip` 事件，i18n；测试。
- **文档**：`API_CONTRACT.md`（SSE 事件表新增 `trip` 行 + 形状）、`ARCHITECTURE.md`（§8 决策 +1 行，注明地图叠加二期）、`docs/tools.md`（planTripTool 条目）、`PROJECT_STATUS.md`。
- **无破坏性变更**：SSE 新事件名、`chatEventSchema` union 增成员、`BehaviorAction` 枚举追加均为向后兼容；现有端点/错误码/行为不变。

## Capabilities

### New Capabilities

- `travel-planning`: 对话式旅行规划——`plan_trip` 意图识别后生成目的地行程（LLM 草稿 + 高德服务端 POI/路线校验），落库 `Trip` 并输出 SSE `trip` 事件，前端渲染行程卡片；高德不可用时优雅降级，目的地缺失时追问澄清。

### Modified Capabilities

- `agent-chat`: 意图枚举追加 `plan_trip`（关键词规则先于 LLM 确定性判定，同 store_insight 模式）；SSE 协议追加 `trip` 事件（追加式 union 成员，既有事件与降级语义不变）。

## Impact

- `packages/shared`：`tripSchemas.ts` 新增 + `sessionSchemas.ts` 的 `chatEventSchema` 追加 + 导出 + `tripSchemas.test.ts`。
- `packages/database`：`Trip` 模型 + `add_trip_model` 迁移 + `BehaviorAction.TRIP_PLANNED`。
- `apps/api`：`amapClient`、`planTripTool`、`intentClassifier`/`planner`/`toolDispatcher`/`responseSynthesizer`/`stateLoop`/`routes/chat.ts` + 测试（amapClient / planTripTool / intent / planner / dispatcher / synthesizer / chat）。
- `apps/web`：`TripTimeline`、`ChatPage` 接线（含回放）、i18n + 测试。
- 文档脊柱：`API_CONTRACT.md`、`ARCHITECTURE.md`、`docs/tools.md`、`PROJECT_STATUS.md`。

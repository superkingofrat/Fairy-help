# Tasks: 2026-10-16-trip-preference-traceability

## 1. shared：偏好依据契约

- [x] 1.1 `tripSchemas.ts` 的 `tripPoiSchema` 增 `preferenceBasis: z.string().nullable().default(null)`（键缺失与显式 null 等价，存量会话历史与历史 `Trip.itinerary` 回放仍可解析）；`tripResultSchema`/`tripDetailSchema` 经 `itineraryDaySchema` 自动继承；`tripListItemSchema` 不动
- [x] 1.2 shared 测试：合法字符串通过、显式 `null` 通过、**缺键**解析为 `preferenceBasis: null`（历史回放兼容）、非字符串/空串拒绝；`tripEventSchema` 与 `tripDetailSchema` 继承验证；`pnpm --filter=@fairy/shared typecheck` + test
- [x] 1.3 手写 `TripResult`/`TripPoi` fixture 补 `preferenceBasis: null`（typecheck 逐处指出：api planTripTool/responseSynthesizer/trips/toolDispatcher、web TripTimeline/TripMap/TripsPage/tripApi/ChatPage）

## 2. API：prompt 落实要求 + 依据产出

- [x] 2.1 `planTripTool.ts` 的 `TRIP_SYSTEM_PROMPT`：JSON 格式与规则增补 `preferenceBasis`——只在真能对应到某条画像偏好时填写，写「哪条偏好 → 因此选/避开了什么」，≤ 20 字；对应不上必须填 `null`，不得为填而编造；`note` 规格不变（仍只写时间/预约/排队）
- [x] 2.2 `buildCompanionLine` 之后（或同一上下文行序列内）追加「落实要求」：每条非空偏好至少在一个 step 的 `preferenceBasis` 里点名，且选点本身要能体现；附少量通用翻译示例（洁癖→避开露天摊位/优先可预订或室内餐饮；服务型→段间留缓冲、不排需赶车的衔接）；无同行人且本人无 `travelStyle` 时 user 消息与改动前逐字一致
  - **Apply 期裁定（2.2 收窄）**：落实要求**只在真的注入了同行人偏好时**追加；本人 `travelStyle` 单独存在时不追加。spec（`travel-planning`「Chat trip planning intent…」）对无同行人情形有一条 MUST——发给草稿模型的 user 消息与偏好注入前逐字一致；proposal.md 的 What Changes 与 Capabilities 也都写「同行人偏好注入后追加」。tasks.md 原条件（无同行人**且**无 travelStyle）是更弱的承诺，收窄后仍满足。本人风格仍受 system prompt「偏好要落实在选点上」与 `preferenceBasis` 契约约束。锁定用例：`planTripTool.test.ts`「keeps the user message byte-identical when only the caller's own travel style exists」
- [x] 2.3 草稿解析：`tripDraftSchema` 的 step 增 `preferenceBasis`（nullish，进入 zod 校验）；`planTripTool` 组 `TripPoi` 时带上 `preferenceBasis: step.preferenceBasis ?? null`；落库 `itinerary` JSON 随之带上该键（**无需迁移**，`Trip.itinerary` 是 Json 列）。实现上经 `toPreferenceBasis()` 收口：缺失、空串、纯空白一律归 `null`（空串会绕过 shared 的 `.min(1)`，等回放解析时才炸）
- [x] 2.4 api 测试：偏好可对应时产出非空 `preferenceBasis`（mock LLM 返回带该键的草稿）；对应不上时为 `null`；无画像偏好时全部为 `null` 且 user 消息与注入前逐字一致；锁 prompt 中「偏好依据」与「不得为填而编造」两句防回退

## 3. API：回复层去幻觉（条件归属 + 依据行）

- [x] 3.1 `buildTripFacts`：统计 itinerary 中非空 `preferenceBasis` 的数量；仅当 ≥ 1 时输出归属断言行「其偏好已体现在行程安排中…」；为 0 时只输出「同行人：X。」，不出现「已体现」类断言
- [x] 3.2 `facts` 新增偏好依据行：把非空 `preferenceBasis` 逐个带进【事实】（含所属 day/step 名称），让回复能具体说出「按什么偏好订的」；`template` 同步带出（无 AI key 兜底同样可依据）
- [x] 3.3 api 测试：有依据时归属行存在且依据行进 facts；无依据（同行人有画像但选点对不上）时归属断言不出现、facts 与改动前逐字一致；无同行人时整体与改动前逐字一致；`responseSynthesizer.test.ts` 既有用例保持绿

## 4. Web：卡片展示偏好依据

- [x] 4.1 `TripTimeline`：step 的 `preferenceBasis` 非空时渲染该依据（i18n 键 `chat.trip.preferenceBasis`，文案含依据原文，如「按{name}的偏好：{basis}」或纯依据文本，二选一在实现时定并记录理由）；为 `null` 时不渲染、无占位
- [x] 4.2 文案入 `apps/web/src/locales/zh-CN.json`（唯一来源）；`/trips` 详情页经同组件自动覆盖，补一条集成断言
- [x] 4.3 web 测试：有依据渲染依据文本、无依据不渲染（且无空壳）；既有用例保持绿

## 5. 文档脊柱

- [x] 5.1 `API_CONTRACT.md`：§3.15.1 创建响应示例与 §3.15.3 详情补 `preferenceBasis`（含「无依据为 `null`」说明）、§2 SSE `trip` 事件节字段清单补 `preferenceBasis`
- [x] 5.2 `ARCHITECTURE.md`：§8 决策行（偏好依据为何放 step 而非 day、为何 `note` 与 `preferenceBasis` 分工、归属行改条件式的防幻觉理由、Json 列免迁移）、§9 模块图/数据流补该字段
- [x] 5.3 `docs/prompts.md` §4：更新 `TRIP_SYSTEM_PROMPT` 逐字快照与「落实要求」要点，记录 D3/D4/D6 的理由
- [x] 5.4 `PROJECT_STATUS.md`：完成后移入 Completed Modules；关联需求/提案文档状态更新

## 6. 验证与归档

- [x] 6.1 四包 typecheck + shared/api/web 测试全绿 + `pnpm lint` + prettier；`pnpm run ci`
- [x] 6.2 真机验收（双 dev server）：AC-1 带 persona 人名（莱卡恩）的请求 → itinerary 至少 1 个 step 带非空 `preferenceBasis`，且该 step 选点本身能体现该偏好（人工核验：洁癖→非露天/可预订，服务型→段间有缓冲）；AC-2 回复中的归属表述能在卡片里找到对应 step 依据（不再是无依据断言）；AC-3 卡片展示该依据；AC-4 无同行人请求 → 全部 `preferenceBasis: null`、回复与 UI 与改动前一致；AC-5 存量历史行程回放正常（缺键不报错、无占位）；AC-6 token 预算无回归（记录实测 `completionTokens`，确认无截断）
- [x] 6.3 通过后 `openspec archive 2026-10-16-trip-preference-traceability --yes` + 移入 Completed Modules + Trellis journal 收尾

## Why

负责人实测泉州两天的行程后反馈「感觉还是没有个性化定制的感觉」。核对代码链路后确认：**个性化只进了 prompt，没有进契约**。

FU-20（2026-10-10）把同行人画像拼进 `planTripTool` 的草稿 prompt，2026-10-11 又做了三件事——把偏好从「参考」升级为「约束」并要求「落实在选点上」（prompt 层）、让 `buildTripFacts` 带上 `day.title` 与 `step.note`（呈现层）、把 `note` 收窄为「只写时间/预约/排队等执行信息」（输出规格层）。但三者方向互相抵消，且没有任何一处能验证偏好是否真的落实：

1. **输出契约里没有承载「哪条偏好落实在哪」的字段**。`tripPoiSchema` 只有 `name/category/time/note/location/validated`；而 `note` 被明确规定只写执行信息。偏好唯一可能留下痕迹的位置被主动禁用，模型既不能在 `note` 里写偏好，也没有别处可写。
2. **回复层在「声称」个性化而不是「展示」，且这个幻觉由我们诱导**。`buildTripFacts` 的同行人归属行是硬编码断言「其偏好已体现在行程安排中」，无论行程里有没有体现都会原样进入【事实】。回复模型据此自然产出「节奏和时段都照着莱卡恩的偏好来安排的」——而「开元寺从西门进」「避开正午」「早班上山」「傍晚看日落」全是普适旅游常识，与「洁癖/优雅/料理标准极高」零关系。这违反 AGENTS §0（不得向用户暴露模型幻觉内容），且源头是我们自己写的那句断言。
3. **注入的偏好是形容词，不是可执行规则**。以 persona「莱卡恩」为例，实际注入的是「旅行风格『服务型行程，先订三套备选方案』；风格标签『优雅、洁癖、全能』；饮食偏好『料理标准极高，餐具必须对齐』」。prompt 里唯一的映射规则只覆盖「忌口/高标准餐饮」，而该 persona `avoidFood` 为空；「先订三套备选方案」在输出结构里更是完全无处安放（itinerary 只有一套固定步骤）。

根因是**契约缺陷**：约束进去了，出口被堵死，中间还没有质检。本期把「偏好依据」提升为行程步骤的一等可空字段，让个性化从看不见变成看得见、可归属、可校验。

## What Changes

- **共享（packages/shared）**：`tripSchemas.ts` 的 `tripPoiSchema` 新增 `preferenceBasis: z.string().nullable().default(null)`（键缺失与显式 `null` 等价，存量会话历史与历史 `Trip` 行的回放负载因此仍可解析——与 FU-20 `companion` 同一兼容手法）。语义：该选点落实了哪条画像偏好，以及因此选/避开了什么；无则 `null`。`tripResultSchema`/`tripDetailSchema` 经 `itineraryDaySchema` 自动继承；`tripListItemSchema` 是独立形状（不含 itinerary），不变。
- **后端 prompt（apps/api/src/tools/planTripTool.ts）**：
  - `TRIP_SYSTEM_PROMPT` 的 JSON 格式与规则增补 `preferenceBasis`：只在**真的能对应到某条画像偏好**时填写，写「哪条偏好 → 因此选/避开了什么」，不超过 20 字；对应不上必须填 `null`，不得为填而编造；`note` 仍只写执行信息（不变）。
  - `buildCompanionLine` 之后追加「落实要求」：每条非空偏好至少要在 itinerary 中一个 step 的 `preferenceBasis` 里点名，且选点本身要能体现（如洁癖→避开露天摊位、优先可预订/室内餐饮；服务型→每段之间留缓冲、不安排需赶车的衔接）。
- **后端回复层（apps/api/src/agent/responseSynthesizer.ts）**：
  - `buildTripFacts` 的同行人归属行改为**条件式**：仅当行程中存在至少一个非空 `preferenceBasis` 时，才输出「其偏好已体现在行程安排中」这类断言；否则只说明同行人是谁，不断言已体现。
  - `facts` 新增偏好依据行，把非空 `preferenceBasis` 逐个带进【事实】，让回复能具体说出「按什么偏好订的」，而不是复读断言。
  - `template` 同步带出（无 AI key 时兜底文案同样可依据）。
- **前端（apps/web）**：`TripTimeline` 在 step 的 `preferenceBasis` 非空时渲染该依据（i18n 键 `chat.trip.preferenceBasis`）；为 `null` 时不渲染、无占位。对话内卡片与 `/trips` 历史详情同组件，行为自动一致。
- **文档**：`API_CONTRACT.md` §3.15 与 §2 SSE `trip` 事件节、`ARCHITECTURE.md` §8/§9、`PROJECT_STATUS.md`、`docs/prompts.md` §4。

## Capabilities

### New Capabilities

（无——偏好依据属 travel-planning 既有能力的行为扩展）

### Modified Capabilities

- `travel-planning`: 行程步骤新增可空的 `preferenceBasis`。行程草稿 MUST 在能对应到画像偏好时填写该字段，并在同行人偏好注入后追加落实要求；对话 `trip` SSE 事件与 REST 创建/详情携带该字段；回复 MUST 仅在存在非空依据时把安排归属到同行人，且 MUST NOT 编造同行人未表达过的偏好；前端卡片 MUST 在依据非空时展示。无画像偏好或对应不上时字段为 `null`，回复、UI 与负载行为与改动前逐字一致（不新增键、不出现空壳、不出现无依据断言）。

## Impact

- 公共契约：`TripPoi`（进而 `TripResult`、chat SSE `trip` 事件、`POST /api/trips` 响应、`GET /api/trips/:id` 详情）新增可空 `preferenceBasis` 字段；列表端点与 `tripListItemSchema` 不变；无新增端点、无错误码变更、无鉴权变更。所有响应仍走统一 `{ code, data, msg }` 信封（AGENTS §0）。
- 数据库：**无需迁移**。`Trip.itinerary` 是 JSON 列，新键随 JSON 走；存量行缺键，回放时经 schema `.default(null)` 解析为 `null`，与 FU-20 `companion` 同一路径。
- 测试：shared schema（合法字符串通过、显式 `null` 通过、**缺键**解析为 `null`、非字符串/空串拒绝）；api（`planTripTool` 在偏好可对应时产出非空依据、对应不上为 `null`、`buildTripFacts` 条件归属与依据行、无同行人时逐字一致）；web（有/无依据两态渲染）；全程 mock，CI 不调真实 LLM/高德。
- 真机验收覆盖：带 persona 人名的请求（SSE 事件带依据 + 回复具体归属 + 卡片展示）、无同行人请求的逐字一致、存量历史行程回放不报错、token 预算无回归。
- 回滚：代码回退后新字段自然为 `null`/缺键，既有功能不受影响；无迁移需回退。

## 明确不做（Non-Goals）

- 不改同行人解析规则（仍按 `Profile.name` 精确匹配、取最先提到的一个）；不做多人同行与协商。
- 不在代码里枚举每个 persona 的偏好→POI 硬编码映射表；可执行规则写在 prompt 侧，数据仍来自画像。
- 不回填历史行程的 `preferenceBasis`（无法从旧数据反推依据）。
- 不改 `note` 的既有收窄规格，不改门禁与错误码，不改 `TRIP_DRAFT_MAX_TOKENS` 的既有值（仅验收其无回归）。
- **不含前端导航门禁修复**：`App.tsx` 的「行程」导航链接与 `/trips` 路由当前对所有登录用户可见（API 侧门禁正确，`toolDispatcher` 与 `tripController` 均已按 admin/agent 拦截）。该缺陷属独立的前端角色门禁缺口，按 §15.2 P1 单独处理，不混入本提案范围。

## Context

- `planTripTool`（`apps/api/src/tools/planTripTool.ts`）FU-20 起解析同行人：`findCompanion` 按 `Profile.name` 在消毒后消息中精确匹配（取最先提到的一个），候选来自 `profileService.listCompanionCandidates(userId)`（除本人外全部画像，不 join `User`）。命中结果目前用于 ① 拼 prompt 行（`buildCompanionLine`）② 随 `TripResult` 带出 ③ `TRIP_PLANNED` 日志 payload。
- `buildCompanionLine` 只拼四个非空字段：`travelStyle`、`styleTags`、`dietPreference`、`avoidFood`。以 persona「莱卡恩」为例，实际注入为「旅行风格『服务型行程，先订三套备选方案』；风格标签『优雅、洁癖、全能』；饮食偏好『料理标准极高，餐具必须对齐』」（`avoidFood` 为空，不产段）。
- `TRIP_SYSTEM_PROMPT` 现行规则里与偏好相关的只有一句：「画像与同行人偏好是约束而非仅供参考：忌口/高标准餐饮就避开路边摊改选可订座的餐厅，注重洁净就避开露天摊位，节奏按旅行风格定；偏好要落实在选点上，note 只写时间/预约/排队等执行信息」。映射规则只覆盖忌口/高标准餐饮/注重洁净三类，且**没有任何输出字段能记录这条映射是否发生**。
- `tripPoiSchema`（`packages/shared/src/schemas/tripSchemas.ts`）字段为 `name/category/time/note/location/validated`；`itineraryDaySchema` 含 `day/title/steps`；`tripResultSchema` 含 `tripId/destination/days/itinerary/route/validated/companion`；`tripDetailSchema = tripResultSchema.extend({ createdAt })`；`tripListItemSchema` 是独立形状（不含 itinerary）。
- `buildTripFacts`（`apps/api/src/agent/responseSynthesizer.ts`）把 `day.title` 与 `step.note` 拼进 `poiLine`，并在 `trip.companion` 非空时追加无条件断言行「同行人：X。其偏好已体现在行程安排中，回复可把具体安排归属于该同行人；不得编造其未表达过的偏好。」
- SSE 是透传：`toolDispatcher` 的 trip 分支把 `planTripTool` 的 `data` 原样放进 `observation.trip`；`routes/chat.ts` 直接 `writeSse(res, "trip", result.trip)`，历史回放同样原样存/原样吐。契约一改，对话内与回放两条路径同时生效。
- `Trip.itinerary` 是 Prisma `Json` 列，新增步骤键**不需要迁移**；存量行缺键，经 schema `.default(null)` 解析为 `null`（与 FU-20 `companion` 同一路径）。
- `TRIP_DRAFT_MAX_TOKENS` = 4000，注释记录默认供应商 `deepseek-v4-flash` 是 reasoning 模型、思考与正文共用同一 completion 预算；实测 2 天行程正文 1300-2000 token。新增字段会占正文，需验收无截断回归。
- 约束（AGENTS）：统一 `{ code, data, msg }` 信封；共享 schema 只在一处声明；AI 生成内容不得编造、不得暴露幻觉（§0）；所有面向用户内容本地化，唯一来源 `apps/web/src/locales/`。

## Goals / Non-Goals

**Goals:**

- 「偏好依据」成为行程步骤的一等可空字段：一条链路（`planTripTool`）产出，三处消费（SSE/REST/回复）共享，无第二实现、无第二解析。
- 个性化**可见**：用户能在卡片上看到某个选点是因为哪条偏好，回复能具体说出「按什么偏好订的」，而不是复读一句断言。
- 归属**可校验**：回复把安排归给同行人，只在行程里真有依据时成立；无依据时不断言。
- 无画像偏好或对应不上时行为与改动前**逐字一致**：`preferenceBasis: null`、回复不带归属断言、UI 不渲染、回放负载不新增键。

**Non-Goals:**

- 不改同行人解析规则；不做多人同行与协商。
- 不在代码里枚举 persona 偏好→POI 的硬编码映射表；可执行规则写在 prompt 侧，数据仍来自画像。
- 不回填历史行程（无法从旧数据反推依据）。
- 不改 `note` 规格、不改门禁与错误码、不改 `TRIP_DRAFT_MAX_TOKENS` 既有值（仅验收无回归）。
- 不含前端导航门禁修复（独立的 P1 缺陷）。

## Decisions

### D1：依据放在 step 上，而不是 day 上

偏好的落点是具体选点（避开露天摊位、改选可订座餐厅），不是「某一天」。放 step 上才能做到「哪个点、因为什么」一对一归属，也让前端的展示有最小粒度。day 级的 `title` 已由 FU-20 后的 `buildTripFacts` 透传，不重复承载。

### D2：`preferenceBasis` 可空 + `.default(null)`，与 `companion` 同款兼容手法

存量会话历史里的 `trip` 事件、存量 `Trip.itinerary` JSON 都没有这个键。用 `z.string().nullable().default(null)` 让「缺键」与「显式 null」等价，回放零改动、零迁移——这是 FU-20 已经验证过的路径（当时靠它保住了 40 条存量事件）。**不**用 `z.string().nullish()`：那会让缺键解析为 `undefined` 而非 `null`，`tripResultSchema.safeParse` 的输出类型出现 `string | null | undefined`，前端判空要写两处。

### D3：归属行从「无条件断言」改为「有条件断言」

现行 `buildTripFacts` 的归属行是恒真句，等于在教回复模型「偏好已经体现了，你照着归因」。改为：仅当 `itinerary` 中存在至少一个非空 `preferenceBasis` 时输出断言句；否则只说明同行人是谁（「同行人：X。」），不出现「已体现」。这是 AGENTS §0 在回复层的直接落地——我们给模型的事实本身不能是幻觉。

### D4：`preferenceBasis` 与 `note` 严格分工，不合并

试过把偏好写进 `note`（2026-10-11 之前的形态），结果是模型只在 `note` 里承认偏好却不改选点（泉州行程配两天街头小吃、备注写「已备注餐具对齐」），后来才把 `note` 收窄成纯执行信息。本期不回到老路：`note` 继续只写时间/预约/排队，`preferenceBasis` 只写「哪条偏好 → 因此选/避开了什么」。两者分开，才能既让偏好落实在选点上、又让依据可被独立校验。

### D5：prompt 侧给可执行规则，但不建硬编码映射表

在 `buildCompanionLine` 之后追加「落实要求」：每条非空偏好至少在一个 step 的 `preferenceBasis` 里点名，且选点本身要能体现。同时给少量通用翻译示例（洁癖→避开露天摊位、优先可预订/室内餐饮；服务型→段间留缓冲、不排需赶车的衔接）。**不**在代码里为每个 persona 写死 POI 清单——画像数据会变，硬编码会立刻过期，且会把「个性化」退化成查表。

### D6：预算风险用「短 + 可空」控住，不提高 `TRIP_DRAFT_MAX_TOKENS`

`preferenceBasis` 限 20 字且大量 step 会是 `null`，新增正文量级在几十到一百多 token。4000 的预算下有 1300-2000 token 的既有正文 + 思考余量，理论上够；但 reasoning 模型的思考量不可控，故验收标准里明确要求实测无截断回归，**不**预先抬高上限（抬高不增加正常调用成本，但会掩盖规格问题）。

### D7（Apply 期补充）：落实要求的追加范围只到同行人

`tasks.md` 2.2 原写「无同行人**且**本人无 `travelStyle` 时 user 消息与改动前逐字一致」，读起来像「有 `travelStyle` 就追加」。但 spec（`travel-planning`「Chat trip planning intent…」MODIFIED 段）对无同行人情形有一条 MUST——「the user message sent to the draft model MUST be byte-for-byte identical to the message before preference injection existed」，且 proposal.md 的 What Changes 与 Capabilities 两处都写「同行人偏好注入后追加落实要求」。按 AGENTS §13.3（代码与脊柱文档不一致时以文档为准），实现取更严的解释：**只在真的注入了同行人偏好时追加**，本人 `travelStyle` 单独存在时不追加。

原条件的承诺更弱（「无同行人且无 travelStyle」才逐字一致），收窄后仍满足；而 spec 的 MUST 只有收窄版能满足。本人风格不因此退化成软参考——system prompt 的「偏好要落实在选点上」与 `preferenceBasis` 契约对 solo 行程仍然生效。锁定用例：`planTripTool.test.ts`「keeps the user message byte-identical when only the caller's own travel style exists」。

## Risks

- **模型把 `preferenceBasis` 当必填凑数**：prompt 明确「对应不上必须填 null，不得为填而编造」，测试锁「对应不上为 null」与「无画像偏好时全 null」两态。
- **回复仍可能过度归属**：条件断言只挡住「无依据时声称有依据」，挡不住「依据薄弱时夸大声称」。靠 facts 里只给真实依据文本 + REPLY_SYSTEM_PROMPT 既有「不得编造」句约束；真机验收人工核验回复表述与卡片依据一致。
- **新增字段导致 JSON 变长、偶发截断**：见 D6，验收要求记录实测 `completionTokens`，若回归则先收规格（每天步数/字数）再考虑预算。
- **历史行程展示空窗**：存量 `Trip` 无依据，回放为 `null` 不渲染。这是预期行为（与 `companion` 一致），但用户可能误以为功能坏了——验收时确认无占位文案、无报错。

## Why

FU-20（2026-10-10）已把同行人画像接进 `planTripTool` 的草稿 prompt，`TRIP_PLANNED` 日志也记下了 `companionName`/`companionUserId`；2026-10-11 又修好了「行程回复只剩一串地名」的呈现层丢失（`buildTripFacts` 现在带 `day.title` 与 `step.note`）。但同行人**至今不是行程结果的一部分**——它只活在 `planTripTool` 的局部变量、日志 payload 和 LLM 草稿里，`tripResultSchema` 无字段、`Trip` 表无列。由此有三个一致性问题：

1. **REST 创建与对话创建不一致**：`POST /api/trips` 复用同一条 `planTripTool` 链路，同行人被算出来后又被丢掉——同一次规划，走对话至少在日志里留下同行人，走 REST 什么也不留。
2. **历史回放丢失**：`GET /api/trips/:id` 从 `Trip` 行投影，同行人不在行里，回放永远看不到；`TripTimeline` 也就无从展示「与谁同行」。
3. **回复无法归属偏好**：`generateReply` 只注入登录用户本人的画像行，回复知道「有偏好被落实了」却不知道那是谁的偏好——只能说「都订好了」，说不出「按莱卡恩的习惯订好了」。回复里出现的人名只是模型从用户消息原文读到的，不是结构化事实。

需求文档已批准（[docs/requirements/2026-10-11-trip-companion-context.md](../../docs/requirements/2026-10-11-trip-companion-context.md)）。本期把同行人提升为行程结果的一等可空字段，贯通 **shared 契约 → 落库 → 回放 → 回复归属 → 前端展示**。

## What Changes

- **共享（packages/shared）**：`tripSchemas.ts` 新增 `tripCompanionSchema`（`name` 非空 + `userId` 非空字符串），`tripResultSchema` 增加 `companion: tripCompanionSchema.nullable().default(null)`（键缺失与显式 `null` 等价，存量会话历史里的 `trip` 事件因此仍可解析）；`tripDetailSchema` 由 `tripResultSchema` extend，自动继承；导出 `TripCompanion` 类型 + 测试。契约向后兼容：新字段可空，旧客户端忽略未知字段，`tripEventSchema` 形状随之扩展但不破坏现有解析。
- **后端（apps/api）**：
  - `planTripTool`：在返回的 `TripResult` 上带 `companion`（复用 FU-20 已算出的局部变量，**不重新解析**；未命中时为 `null`），并在 `Trip` 行落库 `companionName`/`companionUserId`（同一事务）。
  - `tripService.createTrip` 随 `planTripTool` 自动获得该字段；`getTripDetail` 投影时组装 `companion` 对象或 `null`（两列任一为空即 `null`，不产出半截对象）；`listTrips` 列表项**不变**（列表不需要同行人，契约零变更）。
  - `responseSynthesizer.buildTripFacts`：`companion` 非空时在 `facts` 追加归属行，让回复可把体现偏好的安排归属到该同行人；`template` 同步带出（无 AI key 时兜底文案同样可归属）。
- **数据库（packages/database）**：`Trip` 增加 `companionName String?` / `companionUserId String?`（**不加外键**，理由见 design.md）+ 描述性命名的迁移 `add_trip_companion`；新增幂等回填脚本 `scripts/backfill-trip-companions.ts`，从 `BehaviorLog` 的 `TRIP_PLANNED` payload 回填存量 `Trip` 行（只补两列皆空的行）。
- **前端（apps/web）**：`TripTimeline` 在 `companion` 非空时渲染「与 X 同行」（i18n 键 `chat.trip.companion`）；对话内 trip 卡片与 `/trips` 历史详情同组件，行为自动一致。
- **文档**：`API_CONTRACT.md` §3.15 与 §2 SSE `trip` 事件节、`ARCHITECTURE.md` §8/§9、`PROJECT_STATUS.md`。

## Capabilities

### New Capabilities

（无——同行人上下文属 travel-planning 既有能力的行为扩展）

### Modified Capabilities

- `travel-planning`: 行程结果新增可空的 `companion`（`{ name, userId }`）：对话 `trip` SSE 事件与 REST 创建/详情携带该字段，`Trip` 行持久化两列，历史回放与对话内展示一致，回复可把体现偏好的安排归属到同行人；无同行人时字段为 `null`，回复、UI 与负载行为与改动前逐字一致（不新增键、不出现空壳）。

## Impact

- 公共契约：`TripResult`（进而 chat SSE `trip` 事件、`POST /api/trips` 响应、`GET /api/trips/:id` 详情）新增可空 `companion` 字段；`tripListItemSchema` 与列表端点不变；无新增端点、无错误码变更、无鉴权变更。所有响应仍走统一 `{ code, data, msg }` 信封（AGENTS §0）。
- 数据库：一次迁移（`trips` 表两列，均可空，无索引——`companionUserId` 不参与过滤/连接）；存量数据经幂等回填脚本补齐。
- 测试：shared schema 四件套（合法对象/`null`/缺 `name`/非法 `userId`）；api（`planTripTool` 返回与落库、`getTripDetail` 投影两列皆空降级为 `null`、`buildTripFacts` 归属行与无同行人逐字一致、REST 创建与详情透传）；web（`TripTimeline` 有/无同行人两态）；全程 mock，CI 不调真实 LLM/高德。
- 真机验收覆盖：对话内含已注册 persona 人名的请求（SSE 事件 + 回复归属 + UI）、REST 创建后详情回读、无同行人请求的逐字一致、回填脚本重跑无变化。
- 回滚：迁移保留（两列可空、无默认值依赖），代码回退后字段自然为 `null`，不影响既有功能。

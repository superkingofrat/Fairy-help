## Context

- `planTripTool`（`apps/api/src/tools/planTripTool.ts`）FU-20 起已解析同行人：`findCompanion` 按 `Profile.name` 在消毒后消息中精确匹配（取最先提到的一个），候选来自 `profileService.listCompanionCandidates(userId)`（除本人外全部画像，不 join `User`）。命中结果目前只用于 ① 拼 prompt 行（`buildCompanionLine`）② `TRIP_PLANNED` 日志 payload。局部变量 `companion` 在函数尾部仍可访问——本期只是把它带出去，不重解析、不改解析规则。
- `TripResult`（`packages/shared/src/schemas/tripSchemas.ts`）由 `tripResultSchema` 定义；`tripDetailSchema = tripResultSchema.extend({ createdAt })`，故详情自动继承新字段。`tripListItemSchema` 是独立形状（不含 itinerary），不受影响。
- SSE 是透传：`toolDispatcher` 的 trip 分支把 `planTripTool` 的 `data` 原样放进 `observation.trip`；`routes/chat.ts` 直接 `writeSse(res, "trip", result.trip)`，历史回放同样原样存/原样吐。契约一改，对话内与回放两条路径同时生效，无需额外接线。
- `tripService.getTripDetail` 现按 `tripDetailSchema.safeParse` 投影 `Trip` 行；`listTrips` 只投影列表项字段。
- `Trip` 表现有列：`id/userId/destination/days/itinerary/route/status/createdAt/updatedAt`，索引 `@@index([userId, createdAt])`，无同行人相关列。
- `scripts/backfill-memory-embeddings.ts` 是既有回填脚本先例（tsx 直跑、极简 `.env` 加载、幂等选取条件、单条失败不中断、结束打印统计、`pnpm --filter` 入口）。
- 约束（AGENTS）：统一 `{ code, data, msg }` 信封；共享 schema 只在一处声明；每次 schema 变更配一次迁移；密钥只走 env；AI 生成内容不得编造（§0 用户体验保障）。

## Goals / Non-Goals

**Goals:**

- 同行人成为行程结果的一等可空字段，一条链路（`planTripTool`）产出、三处消费（SSE/REST/回复）共享，无第二实现、无第二解析。
- 无同行人时行为与改动前**逐字一致**：`companion: null`、`TRIP_PLANNED` 不新增键、回复不带归属、UI 不渲染、历史回放负载不变。
- 存量数据可补齐且补齐操作幂等可重跑。

**Non-Goals:**

- 不改同行人解析规则（仍精确匹配、取最先提到的一个）；不做多人同行与协商。
- 不把同行人变成可编辑/可删除的行程属性（它是规划时快照）。
- 不为 `companionUserId` 建索引或新增按同行人检索的端点。
- 不改 `TripStatus` 状态流、不改门禁与错误码。

## Decisions

### 1. `companion` 为可空对象，不拆两个顶层字段

`tripCompanionSchema = z.object({ name: z.string().min(1), userId: z.string().min(1) })`，`tripResultSchema` 加 `companion: tripCompanionSchema.nullable().default(null)`。
**理由**：`{ name, userId }` 天然是一组（展示要名字、回填/排查验 id），两个平级可空字段会出现「有 name 无 userId」的中间态，前端要写三态判断；包成对象后只有「有」与「无」两态，`null` 即「无」。展示层只需要 `companion.name`。
**备选（否决）**：`companionName`/`companionUserId` 平铺——与 DB 列名一致是唯一好处，但契约层无此约束，且引入第三态。
**`.default(null)` 是必需的兼容层，不是语法糖**：会话历史里的 `trip` 事件是**落库的旧 payload**（`chatEventSchema`  discriminated union 里含 `tripEventSchema`，`sessionSchemas` 侧用于校验/回放）。若写成裸 `.nullable()`，缺 `companion` 键的存量事件会解析失败——旧行程的历史回放直接坏掉。`.default(null)` 让「键缺失」与「显式 null」等价（都归一无同行人），输出类型仍是 `TripCompanion | null` 两态。
**代价**：`TripResult` 输出类型要求该键存在，所有手写 fixture 需补 `companion: null`（typecheck 会逐处指出，机械修改）。
**备选（否决）**：`.nullish()`——输出类型变成 `TripCompanion | null | undefined` 三态，违背上面「两态」的出发点，消费方要多判一种。

### 2. `Trip` 两列可空、不加外键

`companionName String?` / `companionUserId String?`，无 relation、无索引、无 `onDelete`。
**理由**：同行人是**规划时快照**——画像名可能已改、persona 可能已删，行程要留住「当时和谁一起去的」这个事实。加外键会引入两个都不想要的结果：级联删除把同行的名字从历史行程里抹掉（丢失事实），或 `SetNull` 让「引用了已消失的人」变成静默空值。FU-20 也刻意避免把身份信息（邮箱等）进行程链路；`userId` 只作排查线索，不参与过滤/连接，故不加索引。
**边界**：回填与投影都不信任该列的存在性——两列任一为空即按无同行人处理（投影为 `null`），不产出半截对象。

### 3. `planTripTool` 只做「带出去 + 落库」，解析一次

在既有 `prisma.trip.create` 的 `data` 里加两列（与 `Trip` 写入同一事务，AGENTS §0 数据一致性优先），返回的 `TripResult` 加 `companion: companion ? { name, userId } : null`。`TRIP_PLANNED` payload **保持不变**（未命中仍不新增键）。
**理由**：解析规则是 FU-20 已验证的行为，本期零改动；`companion` 局部变量就在手边，复用即零风险。落库与行程写入同事务：同行人是行程事实的一部分，不允许出现「行程在、同行人丢」的中间态。

### 4. 投影层从两列组装，缺一即 `null`

`getTripDetail` 的 safeParse 入参加 `companion: row.companionName && row.companionUserId ? { name, userId } : null`；`listTrips` 不动（列表项不需要同行人）。
**理由**：回填脚本可能只补上一列（极端情况），投影层做一次收敛，契约层永远只见到完整对象或 `null`，前端两态判断即可。

### 5. 回复归属行：软约束，放在 facts 末尾

`companion` 非空时在 `facts` 追加：`同行人：${companion.name}。其偏好已体现在行程安排中，回复可把具体安排归属于该同行人；不得编造其未表达过的偏好。` `template` 同步带一句（无 AI key 时兜底文案也能归属）。
**理由**：REPLY_SYSTEM_PROMPT 已要求「一到两句」，硬性要求每条回复都带同行人名字会逼出机械重复；软约束（「可」）让模型在偏好确实被落实时才归属。末句是 §0 防幻觉的提示词层落地——同行人的偏好来自其画像，不是其本人在本轮说过的话，模型容易越过这条线。位置放 facts 末尾：与既有「不得编造行程中不存在的偏好」相邻，两条约束互相加强。
**预算**：归属行约 40-60 token，行程回复预算已是 `TRIP_REPLY_MAX_TOKENS = 600`（2026-10-11 实测 137-274 token 后单独放宽），不需再动。

### 6. 前端只在 `TripTimeline` 加一行，判断内聚

`trip.companion` 非空时在「N 天」那行旁/下渲染「与 X 同行」；i18n 键 `chat.trip.companion`（`与 {name} 同行`）。对话内卡片与 `/trips` 详情同组件，自动一致。
**理由**：与 TripMap 的地图槽位同构——判断只依赖 trip 数据本身，放最靠近数据的组件，两个消费点零接线（FU-19 决策 5 先例）。无同行人时不渲染该节点，不出现「与 null 同行」。

### 7. 回填脚本：从 `TRIP_PLANNED` payload 取，幂等选取

`scripts/backfill-trip-companions.ts`：扫 `BehaviorLog` 中 `action = "TRIP_PLANNED"` 且 payload 带 `companionName` 的记录，按 `payload.tripId` 定位 `Trip` 行，仅当两列**皆空**时更新；重跑无变化。逐条失败不中断，结束打印统计（已补/已跳过/失败）。
**理由**：日志是同行人唯一的现存持久化来源（FU-20 起就记了 `companionName`/`companionUserId`），不需要猜。选取条件本身即幂等保证（对齐 `backfill-memory-embeddings.ts` 的做法）。
**边界**：payload 里只有 `companionName` 没有 `companionUserId` 的旧记录——按**跳过**处理（不写半截），并在统计里单独计数告知负责人。

## Risks / Trade-offs

- **契约是增量的，但客户端校验可能严苛**：旧前端用 zod `strict()` 解析 `trip` 事件会因未知字段报错——本仓前端走 `tripEventSchema`（非 strict），`tripDetailSchema` 亦非 strict；风险仅存在于外部自建客户端，属可选字段的正常演进代价。
- **回填依赖日志保留策略**：若 `BehaviorLog` 被清理过，早期行程补不回来——脚本统计「日志缺失的 Trip 行」并如实报告，不假装成功。
- **回复归属可能过度**：模型把「偏好落实」夸大成同行人没说过的话——facts 末句约束 + 验收时人工读几条回复；若仍超标，再把措辞收紧为举例式（「如：按 X 的习惯订了包间」）。
- **`note` 与归属行的信息重复**：note 已写「已备注餐具对齐」这类执行信息，归属行只回答「偏好是谁的」，不重复内容；若实测出现重复，属 prompt 层微调，不改契约。

## Migration Plan

- 迁移 `add_trip_companion`：两列 `String?`，无默认值、无索引、无外键；`prisma migrate dev` 生成后随 PR 提交，`migrate:status` 校验。
- 回填脚本不进 CI、不参与启动流程；交付后在 dev 库跑一次（`pnpm --filter=@fairy/database backfill:trip-companions`），统计结果记入 PROJECT_STATUS。
- 回滚：代码回退后字段自然为 `null`；两列保留不影响任何既有查询（无索引、无约束、可空）。

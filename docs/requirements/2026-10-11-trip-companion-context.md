# 行程结果纳入同行人上下文（对话回复可归属偏好 + 回放可见同行人）

- 状态：implemented（2026-10-11 负责人批准提案 → Apply → 真机验收 AC-1~7 全过 → OpenSpec 归档 [`openspec/changes/archive/2026-10-11-trip-companion-context/`](../../openspec/changes/archive/2026-10-11-trip-companion-context/)）
- 日期：2026-10-11
- 负责人：Flores
- 前置：FU-20 [2026-10-10-trip-companion-profile.md](./2026-10-10-trip-companion-profile.md) 已交付（同行人画像已进入 `planTripTool` 草稿 prompt 与 `TRIP_PLANNED` 日志）；2026-10-11 已交付「行程回复须承载定制信息」（`buildTripFacts` 带上 `day.title`/`step.note`，回复不再只剩一串地名）

## 背景 / 问题

2026-10-11 负责人反馈泉州行程回复「看起来完全没有使用人物个性进行定制」。排查结论与直觉相反：画像**确实**用上了——`day.title` 与 `step.note` 才是偏好唯一的落点，问题在 `buildTripFacts` 只拼 `step.name` 就交给回复模型，定制信息在进模型前已被丢掉（呈现层丢失，非生成层失败）。该缺陷已于同日修复，回复现在能点出「餐厅靠窗位和包间都已订好」「全程不赶时间」。

但修复后仍剩一个**归属**缺口：回复知道「有偏好被落实了」，却不知道**这些偏好是谁的**。`generateReply` 的 `profileLine(context.profile)` 只注入登录用户本人的画像，同行人信息从未进入回复链路——回复里「你和莱卡恩」中的「莱卡恩」只是模型从用户消息原文里读到的名字，不是结构化事实。于是回复只能说「都订好了」，说不出「按莱卡恩的习惯订好了」。

根因（代码事实）：同行人只活在三个地方——① `planTripTool` 内部的局部变量 `companion`（用于拼 prompt 行）；② `TRIP_PLANNED` 日志 payload 的 `companionName`/`companionUserId`；③ LLM 草稿本身。它**不是行程结果的一部分**：`tripResultSchema` 无同行人字段，`Trip` 表无同行人列。由此派生三个一致性问题：

1. **REST 创建与对话创建不一致**：`POST /api/trips` 复用 `planTripTool` 同一链路，同样算出了同行人，然后把它丢掉——同一次规划，走对话能（在日志里）留下同行人，走 REST 什么也不留。
2. **历史回放丢失**：`GET /api/trips/:id` 从 `Trip` 行投影，同行人不在行里，回放永远看不到；对话历史里的回复文字虽已存，但 `TripTimeline` 无从展示「与谁同行」。
3. **公共契约缺位**：chat SSE `trip` 事件与 REST 详情都不带同行人，任何客户端都无法消费这个已经算出来的事实。

## 目标

1. 同行人成为行程结果的一等字段（可空），对话回复可把体现偏好的安排**归属**到该同行人。
2. 同行人落库：`Trip` 行记 `companionName`/`companionUserId`，历史回放与 REST 详情一致呈现。
3. 存量行程从 `TRIP_PLANNED` 日志回填同行人（幂等，只补空行）。
4. 前端行程卡片（对话内与 `/trips` 同一组件）展示同行人。
5. 无同行人时行为与改动前逐字一致：字段为 `null`、回复不带归属、UI 不显示。

## 范围

- **共享（packages/shared）**：`tripSchemas.ts` 新增 `tripCompanionSchema`（`name` + `userId`），`tripResultSchema` 增加 `companion: tripCompanionSchema.nullable()`；`tripDetailSchema` 经 extend 自动继承。契约向后兼容（新字段可空，旧客户端忽略未知字段）。
- **后端（apps/api）**：
  - `planTripTool` 在返回的 `TripResult` 中带上 `companion`（复用已算出的局部变量，不重新解析）。
  - `tripService.createTrip` 落库 `companionName`/`companionUserId`；`getTripDetail`/`listTrips` 投影时组装 `companion` 对象或 `null`。
  - `responseSynthesizer.buildTripFacts`：`companion` 非空时在 `facts` 追加归属行（「同行人：X。其偏好已体现在行程安排中，回复可把具体安排归属于该同行人；不得编造其未表达过的偏好」）；`template` 同步。
- **数据库（packages/database）**：`Trip` 增加 `companionName String?` / `companionUserId String?`（不加外键，理由见下）+ 描述性命名的迁移 + 从 `BehaviorLog` 的 `TRIP_PLANNED` payload 幂等回填脚本。
- **前端（apps/web）**：`TripTimeline` 在 `companion` 非空时渲染「与 X 同行」（i18n 键 `chat.trip.companion`），对话内 trip 卡片与 `/trips` 历史详情同组件自动一致。
- **文档**：`API_CONTRACT.md` §3.15 与 SSE `trip` 事件节、`ARCHITECTURE.md` §8/§9、`PROJECT_STATUS.md`。

## 非目标

- **不做多人同行**：FU-20 已定「取最先提到的一个」，本期不扩展到多人协商。
- **不改同行人解析规则**：仍按 `Profile.name` 精确匹配，不做模糊/别名匹配。
- **不把同行人变成可编辑/可删除的行程属性**：同行人是规划时快照，不是行程的一项设置。
- **不新增按同行人检索行程的端点**：`companionUserId` 不参与过滤/连接，故不加索引。
- **不改 `Trip` 状态流**（`TripStatus`）。

## 受影响模块

| 模块 | 改动 |
|---|---|
| `packages/shared` | `tripSchemas.ts` + 测试 |
| `apps/api` `tools/planTripTool.ts` | 返回 companion |
| `apps/api` `services/tripService.ts` | 落库 + 投影 |
| `apps/api` `agent/responseSynthesizer.ts` | facts/template 归属行 |
| `packages/database` | `schema.prisma` + 迁移 + 回填脚本 |
| `apps/web` `components/chat/TripTimeline.tsx` | 展示同行人 + i18n |
| 文档 | `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md` |

## 验收标准

1. 对话内发送含已注册 persona 人名的行程请求，SSE `trip` 事件含 `companion: { name, userId }`，回复中出现把安排归属给该同行人的表述（如「按莱卡恩的习惯订了包间」）。
2. `POST /api/trips` 创建成功后，`GET /api/trips/:id` 返回同一 `companion` 对象；`Trip` 行两列非空。
3. 无同行人的请求：`companion` 为 `null`，回复与 UI 与改动前逐字一致（无「与 null 同行」之类的空壳）。
4. 存量行程经回填脚本后，凡 `TRIP_PLANNED` 日志带 `companionName` 的 `Trip` 行两列被补上；脚本重跑不产生变化（幂等）。
5. `/trips` 历史详情与对话内 trip 卡片均展示同行人（同一组件）。
6. shared schema 测试：`companion` 接受 `null` 与合法对象，拒绝缺 `name`/非法 `userId`。
7. 全量验证：shared / api / web 三包测试 + typecheck + `pnpm lint` 全绿。

## 待决问题

1. **`Trip.companionUserId` 是否加外键到 `Profile`/`User`？** 推荐**不加**：同行人是规划时快照（名字可能已改、persona 可能已删），加外键会引入级联删除语义与「行程引用了已消失的人」的两难；FU-20 也刻意避免把身份信息进行程链路。若负责人倾向强一致，可改为外键 + `onDelete: SetNull`。
2. **回填范围**：只回填 dev 库现有 6 条带 `companionName` 的泉州/杭州行程，还是写通用脚本？推荐写通用幂等脚本（`scripts/backfill-trip-companions.ts`，对齐既有 `scripts/backfill-memory-embeddings.ts` 先例），dev 库顺带跑一次。
3. **回复归属的措辞强度**：推荐软约束（「可把具体安排归属于该同行人」），避免每条回复都机械地重复同行人名字。

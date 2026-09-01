## Context

当前 chat 全链路无状态：`apps/api/src/routes/chat.ts` 用 `writeSse` 把 `runChatTurn` 的结果流式写出；`agent/stateLoop.ts` 每轮独立调 intent/plan/dispatch/synthesize，`agent/contextBuilder.ts` 是 0 字节占位；Prisma 无会话表。Web 侧 `ChatPage` 把消息存在 `useState`，`useSSE` hook 消费流。见 proposal.md「Why」——本设计只覆盖怎么落地持久化、回放与注入。

## Goals / Non-Goals

**Goals**

- 一套可迁移、可回放、可注入的会话/消息存储，对既有 SSE 契约零破坏。
- 回放与在线消息共用渲染路径，卡片交互（借/还）在回放中可用。
- 上下文注入以最小侵入方式落地（不重构 agent 编排，不引入记忆中心）。

**Non-Goals**

- 不做会话删除/重命名、admin 代查、全文搜索、跨会话长期记忆（记忆中心）、注入条数可配置。

## Decisions

### D1：存储模型 = `Session` + `ChatMessage` 两表，assistant 消息带 `payload Json?`

- `Session`：`id`(uuid) / `userId`(FK→User, 索引) / `title`(String) / `createdAt` / `updatedAt`(索引)。
- `ChatMessage`：`id`(uuid) / `sessionId`(FK→Session, `onDelete: Cascade`, 索引) / `role`(`user`|`assistant`) / `content`(TEXT) / `payload`(Json?) / `createdAt`(索引)。

一次 turn = 1 条 user + 1 条 assistant：assistant 的 `content` 是 SSE 文本事件拼接结果，`payload` 是结构化事件列表 `{ events: [{ type: "recommendation", movie }, { type: "borrow"|"return", movieId, rentalId, remainingStock }] }`。回放时把 events 转回与 SSE 相同的对象喂渲染层。

**备选**：单表 Session + messages JSONB（读写简但按消息查询/注入/未来检索受限）；事件驱动逐条存（N 个事件 = N 行，需 turnId 分组，轮次语义复杂）。选两表：与 Rental/BehaviorLog 同款 Prisma 模式，消息独立成表利于记忆中心接入。

### D2：会话创建双保险——web 显式 `POST /api/sessions`，chat 无 `sessionId` 时后端自动建

「新建会话」按钮调 `POST /api/sessions` 建空会话；同时 `POST /api/chat` 普通消息（非 return action）缺 `sessionId` 时后端自动创建（标题 = 首条 user 消息 trim 后前 20 字符），避免客户端状态泄漏（如刷新丢了 sessionId）导致消息无处挂靠。return action 可不带 sessionId（既有确定归还路径，不强制会话）。

### D3：落库是旁路——SSE 输出优先，落库失败不中断响应

`chat.ts` 在流式写出时收集事件，流结束（含流内降级分支）后写 user + assistant 两条消息；落库用 try/catch 包裹，失败仅 `console.error`（可观测性损失，非功能损失）。SSE 事件形状与现有契约完全一致，`done` 事件可附带 `sessionId` 供客户端对齐会话。

### D4：上下文注入落地 `contextBuilder.ts`，最近 10 条，只注入文本不注入 payload

`runChatTurn` 收到 `sessionId` 后，`contextBuilder` 取该会话最近 10 条（`createdAt` 升序取尾 10）的 `content`，拼成 `user:/assistant:` 交替的「对话历史」段，注入意图分类与回复合成的 LLM 上下文；无历史时输出空。payload（movie 快照等）不注入（避免大 JSON 灌给 LLM）。按 AGENTS §6 加 `TODO(memory-center):` 注释并在 PROJECT_STATUS 登记技术债，未来由记忆中心统一替换。

### D5：权限内聚在 `sessionService`——所有读写按 `userId` 过滤，非本人 403

`sessionService.getOwnedSession(sessionId, userId)` 统一做「存在 + 属主」校验：不存在 → `SESSION_NOT_FOUND`(404)，非本人 → `SESSION_FORBIDDEN`(403)。chat 落库、`GET /api/sessions/:id` 共用同一校验，避免散落到处。

## Risks / Trade-offs

- **[注入是临时方案]** 最近 10 条按 §6 属记忆中心的职责 → `TODO(memory-center)` 注释 + PROJECT_STATUS 技术债登记，接口留 `contextBuilder` 单一入口便于替换。
- **[落库失败静默]** 旁路写入失败只记日志，用户会看到回复但历史缺失 → 接受（可观测性 vs 响应可靠性的权衡）；`console.error` + 字段留空可诊断。
- **[自动建会话产生碎会话]** 刷新丢 sessionId 时普通消息会新建会话 → 客户端把当前 `sessionId` 持久化到 localStorage，刷新优先复用；仍丢失则新会话兜底，不丢消息。
- **[movie 快照过期]** `payload` 存的是借阅时刻的 movie 快照，库存可能已变 → 回放只读展示快照；借/还永远走实时通道，快照不参与任何决策。

## Migration Plan

- 开发：`prisma migrate dev --name add_session_chat_message`（纯新增两表 + 索引，无数据迁移）；`pnpm --filter=@fairy/database generate`。
- 生产：`prisma migrate deploy`。
- 回滚：移除两表 + 回退 API/前端即可（无存量会话数据，零迁移风险）。

## Open Questions

无——删除/重命名会话、admin 代查等均属明确的 out of scope，可安全后置而不改变 specs 或任务拆分。

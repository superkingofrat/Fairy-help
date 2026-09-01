## Why

Chat 当前完全无状态：消息只存在前端 `useState`（刷新即丢），后端 `runChatTurn` 每轮独立、`contextBuilder.ts` 是 0 字节占位，Prisma 也没有会话表。用户无法回看或续聊历史对话，「刚才那部电影」这类跨轮指代无法成立。本变更引入持久化会话，让每段对话可被列出、回放与带上下文续聊。

## What Changes

- **DB**：新增 `Session` 与 `ChatMessage` 表（Prisma + 迁移）；一次 turn = 1 条 user + 1 条 assistant 消息，assistant 的 `content` 存文本、`payload` 存结构化事件（推荐卡片 movie 快照、借/还结果）。
- **API**：新增 `POST /api/sessions`、`GET /api/sessions`、`GET /api/sessions/:id`（仅会话所属用户）；`POST /api/chat` 请求体增加可选 `sessionId`（SSE 事件流不变）；错误码 `SESSION_NOT_FOUND`（404）/`SESSION_FORBIDDEN`（403）。
- **Agent**：`contextBuilder.ts` 落地——续聊时把该会话最近 10 条消息注入意图/回复 LLM 上下文；按 AGENTS §6 以 `TODO(memory-center):` 注释登记技术债（未来由记忆中心统一替换）。
- **Web**：chat 页新增会话区（列表/新建/切换）；历史消息走与在线消息同一渲染路径完整回放（文本、推荐卡片可再借/还、借/还事件）；刷新后通过 `GET /api/sessions/:id` 恢复。
- **无破坏性变更**：chat 请求体仅增加可选字段，SSE 事件形状与既有契约一致；借还事务、行为日志、双写禁令不变。

## Capabilities

### New Capabilities

- `chat-session`: 会话与消息的持久化模型、会话管理 API（列表/新建/单会话读取）、仅属主可访问、历史回放，以及续聊时注入最近 N 条会话历史的上下文连续性。

### Modified Capabilities

（无——`agent-chat` 既有需求全部保持；`sessionId` 为纯增量可选字段，不回退任何既有场景。）

## Impact

- `packages/database`：`schema.prisma` 新增 Session/ChatMessage + 迁移。
- `packages/shared`：`chatRequestSchema` 加 `sessionId?`；新增 session Zod schemas 与类型（SessionListItem、ChatMessageDto）。
- `apps/api`：新增 `sessionService` + `routes/sessions.ts`；`chat.ts` 落库（user + assistant）；`stateLoop`/`contextBuilder` 注入最近 10 条。
- `apps/web`：`ChatPage` 会话区、`lib/sessionApi.ts`、回放渲染接线、i18n（zh-CN）、测试。
- 文档脊柱：`API_CONTRACT.md`（§3 会话端点 + chat 请求体 + §4 错误码）、`ARCHITECTURE.md`（§5 对话流 + §8 决策）、`PROJECT_STATUS.md`（In Progress + 技术债登记）。

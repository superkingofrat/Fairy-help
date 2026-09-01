# FU-7 Session 表与对话历史回放

**Date:** 2026-09-01（grill-me 收敛：2026-09-01；批准：待定）
**Status:** draft（grill-me 已收敛，待用户批准）
**Complexity:** medium（跨 db + shared + api + web，新增公共 API → OpenSpec 轨）

## Goal

为 chat 补齐**对话持久化与历史回放**：每个用户拥有自己的会话列表，可新建、切换、续聊历史会话；历史消息完整回放（文本 + 推荐卡片 + 借/还事件，卡片恢复交互）；续聊时把该会话最近 N 条消息注入 agent 上下文，让「刷新即失忆、跨轮无记忆」成为过去。回放只涉及会话内数据，不做跨会话长期记忆（留给记忆中心）。

## Background

- 当前 chat **完全无状态**：web `ChatPage` 的 `messages` 只存在 `useState`（刷新/切页即丢）；后端 `runChatTurn` 每轮独立，`contextBuilder.ts` 是 0 字节占位文件；Prisma 无 Session/Message 表（仅 User/Movie/Profile/Rental/BehaviorLog）。
- 用户侧已能感知：多轮对话「你刚才说的那部」无法成立；刷新页面后对话消失。
- FU-7 自 Phase 2 起就在 Next Steps 立项（「FU-7 Session 表与对话历史回放」），排在 FU-8/FU-9 之后，现已就绪。
- AGENTS §6 记忆规则：记忆记录须关联 `profileId`、可选 `sessionId`；记忆中心（检索/排序/上下文窗口管理）**尚未实现**，允许以 `TODO(memory-center)` 注释 + PROJECT_STATUS 技术债登记的方式做临时内联查询——本次「注入最近 N 条」按此登记。

## Scope（grill-me 收敛后）

### DB（Prisma + 迁移，OpenSpec 轨）

- **`Session` 表**：`id`（uuid）、`userId`（FK→User，索引）、`title`（String，首条消息自动截取）、`createdAt`、`updatedAt`（会话排序用，索引）。
- **`ChatMessage` 表**：`id`（uuid）、`sessionId`（FK→Session，`onDelete: Cascade`，索引）、`role`（`user` | `assistant`）、`content`（TEXT，文本内容）、`payload`（Json?，结构化事件：assistant 回复的推荐卡片 movie 快照、借/还结果等，供完整回放；user 消息为 null）、`createdAt`（升序回放，索引）。
- 一次 chat turn = 一条 user 消息 + 一条 assistant 消息（assistant 的 `content` 为 SSE 文本事件拼接，`payload` 为事件列表 JSON）。**SSE 事件形状不变**，落库是旁路。

### API（新增/变更）

- `POST /api/sessions`：新建会话（空会话，`title` 空；首条消息落库时自动截取前 20 字）。返回 `{ id, title, createdAt, updatedAt }`。
- `GET /api/sessions`：当前用户会话列表（`title`、`updatedAt`、消息数），按 `updatedAt` 倒序。
- `GET /api/sessions/:id`：单会话消息列表（`createdAt` 升序），供回放渲染。**仅会话所属用户可读**（403 非本人）。
- `POST /api/chat`：请求体增加可选 `sessionId`（refine：`action === "return"` 时可不带 sessionId，走既有确定归还；普通消息带则挂到该会话）；响应 SSE 事件流**不变**。落库：user 消息 + assistant 消息（事件与文本）。
- 错误码：`SESSION_NOT_FOUND`（404）、`SESSION_FORBIDDEN`（403）、`VALIDATION_ERROR`（400）、401。会话写操作仅本人。

### 上下文注入（`TODO(memory-center)` 技术债）

- `contextBuilder.ts` 从 0 字节落地：`runChatTurn` 收到 `sessionId` 后读取该会话**最近 10 条**消息（user+assistant 交替），拼成「对话历史」段落注入意图分类与回复 LLM 的上下文；无历史时行为不变。按 AGENTS §6 在代码加 `TODO(memory-center):` 注释、在 PROJECT_STATUS 登记技术债（未来由记忆中心统一检索替换）。
- 注入仅影响 prompt 上下文，**不改变**工具调度、事务与 SSE 形状。

### Web

- **会话区**（chat 页内，侧栏或顶部）：会话列表（标题 + 相对时间，倒序）、「新建会话」按钮、选中高亮、切换加载。
- **回放渲染**：历史消息走与在线消息**同一渲染路径**——user 文本、assistant 文本、推荐卡片（复用 `RecommendationCard`，可再次借阅/归还，事件落当前会话）、借/还事件文本。刷新后通过 `GET /api/sessions/:id` 恢复。
- **发送**：`postChat` 带当前 `sessionId`；首条消息后会话列表刷新出新标题。
- **API 客户端**：`sessionApi`（list / create / getMessages）；`useSSE` 或 chatApi 透传 `sessionId`。
- **i18n**：`chat.session.*`（title、new、empty、loadError 等键）。
- **测试**：列表渲染/空态、新建、切换加载、回放渲染（文本/卡片/事件、卡片交互）、发送带 sessionId、401/403 处理、刷新恢复。

## Out of Scope

- 会话删除 / 重命名（标题自动生成，不提供编辑）；admin 查看/代查用户会话（仅本人）；跨会话长期记忆与画像更新（记忆中心）；消息编辑/删除；历史全文搜索；注入条数可配置 UI；REST 会话写入之外的任何写端点（归还双写禁令不变）。

## Key Decisions（grill-me 收敛）

| Decision | Choice | Rationale |
|---|---|---|
| 持久化模型 | Session + ChatMessage 两表 | 规范化关系：可查询/分页/注入；与 Rental/BehaviorLog 同款 Prisma 模式；消息独立成表利于未来记忆中心 |
| 会话 UX | 会话列表 + 新建 + 切换 | 完整「历史回放」形态；续聊与回放不割裂 |
| 回放渲染 | 完整回放含交互 | 与在线消息同一渲染路径；回放中推荐卡片可再借/还 |
| 上下文注入 | 注入最近 N 条（10） | `contextBuilder` 落地，agent 记得前文、对话连续；按 §6 登记 `TODO(memory-center)` 技术债 |

## Affected Modules

- `packages/database`：schema.prisma（Session、ChatMessage）+ 迁移 + seed 不动。
- `packages/shared`：`chatRequestSchema` 加 `sessionId?`；新增 session Zod schemas + types（SessionListItem、ChatMessageDto）。
- `apps/api`：新增 `sessionService` + `routes/sessions.ts`；`chat.ts` 落库（user + assistant）；`stateLoop`/`contextBuilder` 注入最近 10 条。
- `apps/web`：`ChatPage` 会话区（列表/新建/切换）、`lib/sessionApi.ts`、回放渲染接线、i18n（zh-CN）、测试（`App.test.tsx` / `ChatPage.test.tsx` 扩展）。
- 文档脊柱：`API_CONTRACT.md`（§3 新端点 + §4 错误码）、`ARCHITECTURE.md`（§5 对话流 + §8 决策）、`PROJECT_STATUS.md`（In Progress / 技术债登记）。

## Acceptance Criteria

- **AC-1** 登录 user 打开 chat 页：会话列表（无会话时空态 + 可新建）；发首条消息后自动生成标题（前 20 字截取）并出现在列表。
- **AC-2** 新建会话 → 空聊天界面；切换历史会话 → 消息完整回放（文本 + 推荐卡片 + 借/还事件），刷新页面后仍在。
- **AC-3** 回放中的推荐卡片可再次借阅/归还，事件与文本落在当前会话，库存/流水正确（复用既有事务）。
- **AC-4** 续聊历史会话时 agent 记得前文：如先「推荐悬疑片」再「第一部那部」，能正确指向前文（注入最近 10 条生效）；无 LLM key 时降级路径不受影响。
- **AC-5** 会话数据隔离：用户 A 无法通过 `GET /api/sessions/:id` 读用户 B 的会话（403）；未登录 401。
- **AC-6** 每条 user/assistant 消息落库（含 payload 事件）；SSE 事件形状与现有契约一致，聊天与借还行为零回归。
- **AC-7** admin 登录同样可用会话区，不影响 admin 页与既有功能。

## Next Step

- [x] grill-me 收敛（2026-09-01，四项决策已定）
- [ ] 用户批准
- [ ] `/opsx:propose` → approve → apply

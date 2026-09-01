# FU-7 Session 表与对话历史回放

## Goal

为 chat 补齐对话持久化与历史回放：每个用户拥有自己的会话列表，可新建、切换、续聊历史会话；历史消息完整回放（文本 + 推荐卡片 + 借/还事件，卡片恢复交互）；续聊时把该会话最近 N 条（10 条）消息注入 agent 上下文（`contextBuilder` 落地，`TODO(memory-center)` 技术债登记）。唯一来源：`docs/requirements/2026-09-01-fu-7-session-history.md`（已批准，grill-me 收敛四项决策）。**跨 db + shared + api + web 四包，OpenSpec 轨**。

## Requirements

### DB（Prisma + 迁移）

- **`Session` 表**：`id`（uuid）、`userId`（FK→User，索引）、`title`（String，首条消息自动截取前 20 字）、`createdAt`、`updatedAt`（倒序索引）。
- **`ChatMessage` 表**：`id`（uuid）、`sessionId`（FK→Session，`onDelete: Cascade`，索引）、`role`（`user`|`assistant`）、`content`（TEXT）、`payload`（Json?，assistant 事件列表：推荐卡片 movie 快照、借/还结果）、`createdAt`（升序索引）。
- 一次 turn = 1 条 user + 1 条 assistant；SSE 事件形状不变，落库为旁路。

### API

- `POST /api/sessions`：新建空会话，返回 `{ id, title, createdAt, updatedAt }`（title 为空，首条消息落库时自动生成）。
- `GET /api/sessions`：当前用户会话列表（title、updatedAt、消息数），`updatedAt` 倒序。
- `GET /api/sessions/:id`：单会话消息列表（`createdAt` 升序），仅本人（403 非本人）。
- `POST /api/chat`：请求体加可选 `sessionId`；SSE 事件流不变；落库 user + assistant 消息。
- 错误码：`SESSION_NOT_FOUND`（404）、`SESSION_FORBIDDEN`（403）、400/401。

### 上下文注入（TODO(memory-center)）

- `contextBuilder.ts` 从 0 字节落地：`runChatTurn` 按 `sessionId` 读最近 10 条消息拼「对话历史」注入意图/回复 LLM；无历史行为不变；按 §6 加 `TODO(memory-center):` 注释 + PROJECT_STATUS 技术债。

### Web

- chat 页会话区：会话列表（标题 + 相对时间，倒序）、「新建会话」按钮、选中高亮、切换加载。
- 回放渲染：历史消息走与在线消息同一渲染路径（文本、推荐卡片复用 `RecommendationCard` 可再借/还、借还事件）；刷新后 `GET /api/sessions/:id` 恢复。
- `sessionApi`（list / create / getMessages）；`postChat` 带 `sessionId`。
- i18n：`chat.session.*` 键（zh-CN）。

## Acceptance Criteria

- [ ] AC-1 登录 user 打开 chat 页：会话列表（无会话时空态 + 可新建）；发首条消息自动生成标题并出现在列表
- [ ] AC-2 新建会话 → 空聊天界面；切换历史会话 → 消息完整回放（文本 + 推荐卡片 + 借/还事件），刷新后仍在
- [ ] AC-3 回放中推荐卡片可再次借阅/归还，事件落当前会话，库存/流水正确（复用既有事务）
- [ ] AC-4 续聊历史会话 agent 记得前文（注入最近 10 条生效）；无 LLM key 时降级路径不受影响
- [ ] AC-5 会话数据隔离：用户 A 读用户 B 会话 403；未登录 401
- [ ] AC-6 每条 user/assistant 消息落库（含 payload 事件）；SSE 事件形状与现有契约一致，零回归
- [ ] AC-7 admin 登录同样可用会话区，不影响 admin 页

## Notes

- OpenSpec 轨：需求已批准，下一步 `/opsx:propose` → 用户 approve → apply。
- 设计/实现细节由 OpenSpec proposal + tasks.md 承载（本 task 保持 PRD-only）。
- Out of Scope：会话删除/重命名、admin 代查、跨会话长期记忆（记忆中心）、注入条数可配置。

## 1. DB + Shared

- [ ] 1.1 `schema.prisma` 新增 `Session`（userId FK 索引、title、createdAt、updatedAt 索引）与 `ChatMessage`（sessionId FK Cascade 索引、role、content、payload Json?、createdAt 索引）；迁移 `add_session_chat_message` + `generate`
- [ ] 1.2 `packages/shared`：`chatRequestSchema` 加 `sessionId?`（refine：return action 可省略）；新增 session Zod schemas + types（`SessionListItem`、`ChatMessageDto`、`ChatEvent` 联合类型）

## 2. API

- [ ] 2.1 `sessionService`：create / list（updatedAt 倒序 + 消息数）/ getById（升序）/ `getOwnedSession`（存在 + 属主校验 404/403）/ 旁路写入（user+assistant 两行，含 payload 事件）/ 标题生成（首条 user 消息 trim 前 20 字）
- [ ] 2.2 `routes/sessions.ts`：`POST /api/sessions`、`GET /api/sessions`、`GET /api/sessions/:id`（Bearer-only，错误映射 `SESSION_NOT_FOUND`/`SESSION_FORBIDDEN`/400/401）
- [ ] 2.3 `chat.ts` 落库：收集 SSE 事件（text/recommendation/borrow/return），流结束后旁路写 user + assistant 消息（try/catch 不中断响应），`done` 事件带 `sessionId`；无 sessionId 普通消息后端自动建会话
- [ ] 2.4 `contextBuilder.ts` 落地：`runChatTurn` 按 `sessionId` 读最近 10 条 `content` 拼「对话历史」段注入 intent/回复 LLM；无历史行为不变；加 `TODO(memory-center):` 注释

## 3. Web

- [ ] 3.1 `lib/sessionApi.ts`（list / create / getMessages，Bearer + 401 处理）；`postChat`/`useSSE` 透传 `sessionId`
- [ ] 3.2 `ChatPage` 会话区：会话列表（标题 + 相对时间，倒序）、「新建会话」按钮、选中高亮、切换加载；当前 `sessionId` 持久化 localStorage，刷新优先恢复
- [ ] 3.3 回放渲染：历史消息走与在线消息同一渲染路径（user 文本 / assistant 文本 / payload 事件 → 推荐卡片复用 `RecommendationCard` 可再借还 / 借还事件文本）；首条消息后会话列表刷新新标题
- [ ] 3.4 i18n：`chat.session.*` 键（title/new/empty/loadError 等，zh-CN）

## 4. Tests + Docs + Verification

- [ ] 4.1 API 测试：sessionService（create/list/getById/标题生成/旁路写入）、sessions 路由（201/200/404/403/400/401）、chat 落库（事件收集、降级分支也落库、自动建会话）、contextBuilder 注入（有/无历史、payload 不注入）
- [ ] 4.2 Web 测试：会话区（空态/新建/列表/切换加载/localStorage 恢复）、回放渲染（文本/卡片/事件/卡片交互）、发送带 sessionId、401 处理
- [ ] 4.3 Shared 测试：`chatRequestSchema` sessionId 可选 + return action 豁免；session schemas 校验
- [ ] 4.4 文档脊柱：`API_CONTRACT.md`（§3 会话端点 + chat 请求体 `sessionId` + §4 错误码）、`ARCHITECTURE.md`（§5 对话流 + §8 决策：会话持久化旁路、注入 TODO(memory-center)）
- [ ] 4.5 验证：四包 typecheck + 测试全绿 + `openspec validate` + 真机验收 AC-1~AC-7

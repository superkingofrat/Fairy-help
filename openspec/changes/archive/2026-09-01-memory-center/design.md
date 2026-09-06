## Context

跨会话记忆自 Phase 2 起挂账：`contextBuilder.buildConversationHistory` 以 `TODO(memory-center)` 临时旁路把最近 10 条会话原文拼成纯文本注入 prompt——新会话即丢失、无相关性排序。ai-sdk `embed()` 已实现（仅 OpenAI 供应商，DeepSeek 不支持）但未接入。可复用的既有模式：`tryChat("agent.*")` + zod 校验 + 静默降级（FU-12/13 教训：deepseek 对严格 JSON 不可靠 → 低 temperature + 重试 + 容错）、SSE 完成后的旁路写库、`profileService.getByUserId`（stateLoop 顶部已查询一次并透传）。动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- 结构化记忆落库：每轮对话完成后 LLM 抽取偏好/事实/意图，按 `profileId` 落库（`sessionId` 可空），用户隔离。
- 检索注入：下一轮 prompt 组装时按 `profileId` + kind + 时间倒序 + 关键词检索 ≤5 条注入，替换 `TODO(memory-center)` 纯文本旁路；近期会话历史（现状 10 条）与之共存。
- 降级友好：抽取失败、LLM/embed 不可用、DB 异常时对话完全不受影响。

**Non-Goals:**
- 不做管理 UI（admin 查看/编辑/删除记忆）、REST 记忆端点（二期走 OpenSpec 加公共契约）。
- 不做 pgvector 向量检索（一期结构化检索，embedding 不生成不存储）。
- 不做画像反向回写、跨用户记忆共享。

## Decisions

1. **每轮抽取 + 静默降级（用户已拍板）**
   每轮对话完成（SSE 完成后旁路）都调 `tryChat("agent.memory")` 抽取一次；失败/超时/schema 校验失败返回空数组，不中断响应、不暴露错误。备选「仅显式偏好声明时抽取」需额外意图判断层，一期复杂度高，已否决。

2. **记忆 ≤5 条 + 近期会话历史共存（用户已拍板）**
   `searchMemories` 默认限量 5 条注入【记忆】区块；近期会话历史仍由 `sessionService` 提供，两段共存，注释说明二期统一。备选「仅注入记忆」丢失即时上下文，已否决。

3. **结构化检索，不依赖 embed**
   一期检索 = `profileId` 过滤 + 可选 `kind` 过滤 + `createdAt` 倒序 + `content` 包含匹配，限量 N。理由：DeepSeek 供应商不支持 embed，依赖向量会绑定 OpenAI key 环境；且 `Unsupported(vector)` 在 Prisma/Neon 上引入运维复杂度。备选「存 embedding + pgvector」列为二期（届时 `@@index([embedding])` 扩展）。

4. **`kind` 枚举三值：`preference | fact | intent`**
   偏好（喜欢什么/不喜欢什么）、事实（用户陈述的客观信息）、意图（想做的事）。与 FU-2 画像标签语义对齐；不引入更多值避免 LLM 分类漂移。

5. **`metadata` 用 Json 可空字段预留演进**
   一期不写入（`null`），但保留列，二期可放 embedding、来源消息 id、置信度等；避免届时再迁移。

6. **抽取输入 = 本轮用户消息 + Fairy 回复**
   抽取器只接收当前轮 text（不进历史全量），控制 token 成本；`sanitizeUserInput` 先清洗再送 LLM（AGENTS §5）。

7. **旁路时机：SSE 完成后 `await`，但失败不影响流**
   在 chat 路由 SSE 发完 `done` 后调用抽取 + 落库（`fire-and-forget` 语义但用 `void` + catch 包裹，不阻塞响应返回）；单元测试可断言抽取在响应完成后执行。

8. **无公共契约变更**
   一期无新 REST 端点、无新 SSE 事件；`chatEventSchema`/`BehaviorAction`/HTTP envelope 均不变，仅内部 prompt 组装与落库变化。API_CONTRACT 仅加内部说明。

9. **Prisma 模型命名 `Memory`，索引两条**
   `@@index([profileId, kind])`（按用户+类别检索）、`@@index([profileId, createdAt])`（按用户+时间倒序检索）；迁移名 `add_memory_model`。

10. **测试全部 mock**
    `memoryService`（增/查/用户隔离/限量）、`memoryExtractor`（成功/失败静默）、`contextBuilder`（记忆注入 + 无记忆干净 prompt）、chat 链路（抽取旁路 + 跨会话复用 + 无 OpenAI key 降级）；禁止 CI 调用真实 LLM。

## Risks / Trade-offs

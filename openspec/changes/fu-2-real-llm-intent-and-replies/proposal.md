## Why

Phase 2 的意图分类是枚举子串匹配、回复是 6 句硬编码模板——「emo」「睡不着」这类自然表达完全听不懂，回复腔调机械。`packages/ai-sdk` 与 `agent/usage.ts` 均为 0 字节占位，供应商 key 已在本地 `.env` 但无任何代码消费。grill-me 需求已批准（`docs/requirements/2026-08-29-fu-2-real-llm-intent-and-replies.md`），默认供应商/模型由用户拍板为 DeepSeek `deepseek-v4-flash`。

## What Changes

- `packages/ai-sdk` 从零实现统一接口 `chat()` / `stream()` / `embed()` + token 用量元数据；供应商为 DeepSeek（默认，OpenAI 兼容 adapter）、OpenAI、Claude 三家并存，全部纯 fetch adapter（依赖零增加，移除未被使用的 `openai` 依赖）。
- `classifyIntent` 内部改为 LLM 结构化输出（JSON，zod 校验），支持非枚举表达到 mood/scene 枚举映射，新增 `chitchat` 意图（纯闲聊不调工具）；规则实现整体保留为 fallback。
- `synthesize` 内部改为 LLM 生成自然中文回复（只引用工具观察事实 + profile 摘要）；模板实现保留为 fallback。
- 降级集中在 `stateLoop`/`llmClient`：缺 key、超时、供应商错误、JSON 解析失败 → 自动退回规则/模板链路，路由与前端无感。
- SSE 协议（事件名/负载形状）与前端**零改动**；`stream()` 只做接口与实现，路由本轮只消费 `chat()`。
- 新环境变量 `AI_PROVIDER` / `AI_MODEL` / `DEEPSEEK_API_KEY` / `AI_TIMEOUT_MS` 登记 `.env.example`。
- 同步 `API_CONTRACT.md`（LLM 行为与降级说明）、`ARCHITECTURE.md`（AI 集成层）；Apply 完成后 archive 并更新 `PROJECT_STATUS.md`。

## Capabilities

### New Capabilities

- `ai-provider`: 供应商无关的 LLM SDK 包（统一接口、环境选择、类型化失败语义）。

### Modified Capabilities

- `agent-chat`: 意图理解与回复文本由真实 LLM 生成（规则/模板为 fallback），新增 chitchat 类；SSE 事件名、负载形状、movieId 直传优先级与工具权威全部不变。

## Impact

- 代码：`Fairy/packages/ai-sdk`（全量）、`Fairy/apps/api/src/agent/`（intentClassifier、responseSynthesizer、stateLoop、llmClient 新增、usage）、`apps/api/.env.example`
- 不改 Prisma schema / 迁移；不改 web 前端；不改 SSE 契约形状
- 测试全部 mock 供应商（CI 不打真 API）；现有路由测试依赖「无 key → 自动降级」保持绿
- 新环境变量：`AI_PROVIDER`、`AI_MODEL`、`DEEPSEEK_API_KEY`、`AI_TIMEOUT_MS`
- 需求来源：`docs/requirements/2026-08-29-fu-2-real-llm-intent-and-replies.md`

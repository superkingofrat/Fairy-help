# FU-2 真实 LLM 替换规则意图与模板回复

**Date:** 2026-08-29
**Status:** approved
**Complexity:** complex

## Goal

用户用自然语言（不必说出枚举标签原文）与 Fairy 对话时，意图理解与回复生成由真实 LLM 完成；规则/模板链路降级为 fallback。`packages/ai-sdk` 首次真实落地（DeepSeek 默认，OpenAI / Claude 并存支持），agent 编排边界与 SSE 协议不变。

## Background

- Phase 2 既定决策（[2026-08-21-phase2-agent-recommend-borrow.md](./2026-08-21-phase2-agent-recommend-borrow.md)）：保留 `IntentClassifier → Planner → ToolDispatcher → ResponseSynthesizer` 边界，分类器与合成器为规则/模板实现，**FU-2 只替换内部，不改 SSE 事件名**。
- 现规则链路：`movieId UUID → 「借」+片名子串 → mood/scene 枚举子串 → 引导语`；回复为 6 句硬编码模板。无法理解「emo」「睡不着」等非枚举表达。
- `packages/ai-sdk/` 的 `openaiProvider.ts`、`claudeProvider.ts`、`providers/index.ts`、`streaming.ts` 与 `apps/api/src/agent/usage.ts` **均为 0 字节**，接口从零实现。
- `apps/api/.env` 已有 OPENAI/ANTHROPIC key（未被任何代码消费）；**无 DEEPSEEK_API_KEY**，联调前需用户补充。
- 宪法约束：工具权威（借阅必须经 tool call）、统一响应格式（SSE 事件名不变）、优雅降级（禁止暴露原始错误）、密钥只进环境变量。

## Requirements

- **REQ-1** `packages/ai-sdk` 实现统一接口 `chat()`、`stream()`、`embed()`，返回供应商无关的 token 用量元数据（`promptTokens`/`completionTokens`/`totalTokens`）。供应商：**DeepSeek（默认，OpenAI 兼容 adapter）**、OpenAI、Claude。供应商特化逻辑只在 SDK 包内；消费方经工厂 + `AI_PROVIDER` 环境变量选择，不得直接 import 供应商客户端。
- **REQ-2** 意图理解替换：`classifyIntent` 内部改为 LLM 结构化输出（JSON：`intent`、`moods[]`、`scenes[]`、`movieTitle?`），支持非枚举表达到 mood/scene 枚举的映射（如「emo」→ 致郁、「睡不着」→ 失眠夜）。闲聊类输入（问候等）归为 `chitchat`，不调工具。LLM **不产生 movieId**：借片意图输出片名，沿用现有 title-match 服务解析；一键借阅仍由前端直传 `movieId` 优先。规则实现保留为 fallback。
- **REQ-3** 回复合成替换：`synthesize` 内部改为 LLM 生成自然中文回复，提示词注入 profile 摘要（名字、likeGenres）与工具观察结果。回复**只能引用 observation 中的事实**（片名、库存、错误码语义），不得虚构业务数据。模板实现保留为 fallback。
- **REQ-4** SSE 协议不变：`text`/`recommendation`/`borrow`/`done` 事件名与负载形状不变；本轮**整段返回**（一条 `text` 事件），前端零改动。SDK 实现 `stream()` 接口（§5 要求）但路由本轮只消费 `chat()`。
- **REQ-5** 优雅降级：`AI_PROVIDER` 未配置、缺 key、超时或供应商报错时，自动退回规则+模板链路；用户始终得到可用回复；日志可含细节但**不得**把错误堆栈/响应负载透给用户。
- **REQ-6** token 用量：SDK 每次调用返回 usage 元数据；`agent/usage.ts` 落最小实现（每轮记录一次，logger 输出即可，不做看板——BehaviorLog 查询属 FU-3）。
- **REQ-7** 环境变量：新增 `AI_PROVIDER`（`deepseek|openai|claude`，默认 `deepseek`）、`AI_MODEL`（默认 `deepseek-v4-flash`）、`DEEPSEEK_API_KEY`，可选 `AI_TIMEOUT_MS`；全部登记进 `apps/api/.env.example`（占位值）。
- **REQ-8** 用户输入在发送给供应商前清洗（§5）；所有测试 mock 供应商（§7），CI 不打真 API；提示词为中文，系统提示定义 Fairy 门店助理人设与 JSON 输出格式。
- **REQ-9** 脊柱文档同步：`API_CONTRACT.md`（SSE 形状不变则仅补 LLM 行为与降级说明）、`ARCHITECTURE.md`（AI 集成层、供应商工厂、降级路径）、`PROJECT_STATUS.md`（实现后归档阶段）。

## Acceptance Criteria

- **AC-1**（联调，需真 key）发送「今晚有点 emo，想哭一场」→ 返回推荐（mood 映射到 致郁/治愈 类标签），且回复为自然语言（不等于现有 6 句模板之一）。
- **AC-2**（联调，需真 key）「帮我借千与千寻」→ SSE `borrow` 成功事件，库存事务真实发生（与 Phase 2 行为一致）。
- **AC-3**（自动化）`AI_PROVIDER`/key 缺失、mock 供应商超时或 500 时，响应仍为合法 SSE（`text`+`done`），内容来自规则/模板 fallback，无 500、无堆栈。
- **AC-4**（自动化）「帮我借千与千寻」在 mock LLM 下输出 `borrow` 意图（片名），经现有 title-match 解析为 movieId 并走 tool call；一键借阅（直传 `movieId`）不经过 LLM 意图解析。
- **AC-5**（自动化）闲聊「你好」得到自然回复，`recommendation`/`borrow` 事件**不**出现。
- **AC-6**（自动化）SDK 单测：三家供应商的请求构造（base_url、model、headers、消息体）与 usage 元数据解析，全部 mock HTTP，互不依赖真实 key。
- **AC-7**（自动化）`pnpm --filter=@fairy/ai-sdk test`、`@fairy/api test`、`@fairy/web test` 全绿；四包 typecheck 通过。

## In Scope

- `packages/ai-sdk`：统一接口、DeepSeek（OpenAI 兼容）/ OpenAI / Claude 三实现、工厂、usage 元数据
- `classifyIntent` LLM 化 + 规则 fallback；`synthesize` LLM 化 + 模板 fallback
- `agent/usage.ts` 最小用量记录
- 新环境变量 + `.env.example` 登记
- 单测（全 mock）与脊柱文档同步

## Out of Scope

- 逐 token 流式消费（SDK 有 `stream()` 接口，路由本轮不接）
- Session 表 / 多轮历史上下文（FU-7）；记忆中心 embedding 检索
- BehaviorLog 查询与流水 UI（FU-3）；归还意图（FU-4）；JWT（FU-5）
- prompt 缓存、成本看板、用量告警
- 语音、多模态、旅行工具（`tripPlannerTool` 维持现状）

## Key Decisions

| Decision | Choice | Rationale | Trade-off |
|---|---|---|---|
| 默认供应商/模型 | DeepSeek `deepseek-v4-flash`（用户拍板） | 用户选定；OpenAI 兼容协议使 adapter 薄 | §5 要求三家并存，Claude/OpenAI 实现不可省 |
| 流式形态 | 本轮整段返回；`stream()` 只做接口 | 前端零改动，最小切片（用户节奏） | 打字机体验延后 |
| 降级策略 | 规则/模板链路整体保留为 fallback | 宪法优雅降级；无 key/故障时演示不断 | 双路径要测两遍 |
| 意图输出 | LLM 结构化 JSON，不产 movieId | 片名 → title-match 解析保持工具权威 | 依赖服务端片名匹配质量 |
| 回复事实边界 | 只引用 observation 事实 | 防幻觉（宪法用户体验保障） | 表达自由度略受限 |
| SSE 协议 | 事件名/负载完全不变 | Phase 2 既定；前端与契约零破坏 | — |
| 用量记录 | logger 每轮一条 | §5 最低要求；看板归 FU-3 之后 | 无法按用户聚合（本轮可接受） |

## Technical Notes

- **adapter 复用**：DeepSeek 与 OpenAI 共用 OpenAI 兼容 adapter（不同 `baseURL`/`apiKey`/`model`），Claude 独立 adapter。
- **调用次数**：每轮最多 2 次 LLM 调用（意图 1 次 + 合成 1 次）；`chitchat` 与 fallback 路径 0–1 次。意图调用用低 max_tokens 限制成本。
- **降级触发点**：工厂创建失败（缺 key）、意图 JSON 解析失败、调用超时/5xx——全部进规则路径，处理集中在 `stateLoop`，不让路由感知。
- **输入清洗**：剥离控制字符与超长输入（上限如 2000 字符），截断后仍降级安全。
- **embed()**：接口按 §5 暴露；本轮实现到「OpenAI 可用、其余供应商明确 NOT_SUPPORTED」即可，消费方暂无调用者。
- **测试**：`packages/ai-sdk` 用注入 fake fetch / mock server；agent 测试沿用 `vi.mock` 供应商模块的模式（同 `chat.test.ts`）。

## Risks & Open Questions

- DeepSeek v4-flash 的实际上下文窗口/价格待联调确认——全部经环境变量可调，无硬编码。
- `DEEPSEEK_API_KEY` 需用户联调前加入 `apps/api/.env`；缺失只影响 AC-1/AC-2 的真机验收，不阻塞开发与 CI。
- LLM 意图对歧义输入（「借」字出现但无片名）的行为需在 propose 阶段定 JSON schema 细节。

## Affected Modules

- `Fairy/packages/ai-sdk/`（全部从零）
- `Fairy/apps/api/src/agent/`：`intentClassifier.ts`、`responseSynthesizer.ts`、`stateLoop.ts`、`usage.ts`、`__tests__/`
- `Fairy/apps/api/.env.example`；`.env`（本地，用户补 key）
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`
- 前端**零改动**（SSE 协议不变）

## Next Step

- [x] User approves this doc
- [ ] Run `/opsx:propose`（change：`fu-2-real-llm-intent-and-replies`）
- [ ] User reviews artifacts, then `/opsx:apply`

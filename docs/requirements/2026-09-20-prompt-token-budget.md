# 需求：prompt token 预算与上下文窗口裁剪

**Date:** 2026-09-20（合伙人审核提出，用户批准后经 Trellis 轨交付）
**Status:** implemented（2026-09-20，Trellis 轨；验收见 PROJECT_STATUS.md）
**轨道：** Trellis（单 api agent/contextBuilder.ts 变更；无新端点、无 schema 变更、不改 `API_CONTRACT.md` 公共契约）
**前置：** FU-14 记忆中心（`buildMemoryBlock` + `buildConversationHistory` 已交付）

## 背景 / 问题

`ARCHITECTURE.md §399` 写明「prompt 上下文受 token 预算约束」，但 `contextBuilder.ts` 目前只做 `join`，没有长度控制：
- `buildConversationHistory` 对最近 10 条消息的单条长度不截断，长消息（用户粘贴大段文本）会撑大 prompt
- `buildMemoryBlock` 每条记忆上限 2000 字（`memorySchemas.ts:89`），5 条最多 10k 字符
- 长会话 + 长记忆 → prompt 成本上升，甚至触发供应商上下文超限导致 400 报错

## 目标

在 `contextBuilder` 给 prompt 组装加一层 token 预算保护：估算上下文总 token 数，超出时优先裁剪会话历史（记忆 ≤5 条是主动注入，优先级高于历史）。

## 范围

- `apps/api/src/agent/contextBuilder.ts`：
  - 导出 `estimateTokens(text)`：粗略估算（英文 4 字符/token、中文 1.5 字符/token，或简单 `Math.ceil(text.length / 4)`）
  - `buildConversationHistory` + `buildMemoryBlock` 组合后超出 `MAX_PROMPT_TOKENS`（默认 4000）时，从历史头部丢弃最旧轮次（2026-09-24 勘误：原稿「从历史尾部裁剪」与下一条「保留最新 N 条」自相矛盾，经 §13.3 流程按下条为准修正）
  - 记忆不裁剪（记忆是主动选择的结果，比历史更重要）；历史裁剪时保留最新 N 条
- `apps/api/src/agent/stateLoop.ts`：调用 `contextBuilder` 前传入 `MAX_PROMPT_TOKENS` 常量
- 测试：contextBuilder 超限时历史被裁剪、记忆保留；短上下文不裁剪

## 非目标

- 不引入 tokenizer 依赖（用粗略估算，足够作为保护阈值即可）
- 不改变 SSE 事件形状、工具调度或任何 `API_CONTRACT.md` 条目
- 不做 prompt 分片（超出预算直接裁剪，不拆多轮）
- 不暴露 token 用量给前端（usage 已在 `usage.ts` 打日志，消费端留后续需求）

## 受影响模块

| 模块 | 变更 |
|---|---|
| `apps/api/src/agent/contextBuilder.ts` | `estimateTokens` + 裁剪逻辑 |
| `apps/api/src/agent/stateLoop.ts` | 传 MAX_PROMPT_TOKENS 常量 |
| `apps/api/src/__tests__/contextBuilder.test.ts` | 裁剪用例 |

## 验收标准

- **AC-1**：5 条记忆（各 500 字）+ 10 条历史（各 2000 字）→ 总字符约 22500 → `estimateTokens` ≈ 5625 → 超出 4000 时历史被裁剪，记忆 5 条完整保留
- **AC-2**：短上下文（3 条历史 + 2 条记忆）→ 不裁剪
- **AC-3**：记忆块为空时，只裁剪历史，总 token 数不超阈值

## 待决问题

1. `MAX_PROMPT_TOKENS` 默认值：建议 4000（对应 `deepseek-v4-flash` 128k 上下文的安全预算），是否需区分供应商？
2. `estimateTokens` 精度：粗略字符比足够做保护；如需精确可后续换 tiktoken。

# chat 端点限流

# 需求：chat 端点限流

**Date:** 2026-09-20（合伙人审核提出；待用户批准进入 Trellis）
**Status:** draft
**轨道：** Trellis（单 api routes 文件 + app.ts 配置变更；无新端点、无 schema 变更、不改 `API_CONTRACT.md` 公共契约）
**前置：** FU-10 账号体系闭环（`express-rate-limit` 已在 `app.ts` 内创建并覆盖 login/register）

## 背景 / 问题

当前 `POST /api/chat` 没有任何限流。注册是自助开放的，任意注册账号即可无限打 chat，每轮触发 2–3 次 LLM 调用（意图分类 + 合成 + 记忆抽取），直接产生真实 API 账单。

已知对比：`/api/auth/login` 与 `/api/auth/register` 已有 IP 限流（login 10 次/15 分钟、register 20 次/小时）。

## 目标

为 `/api/chat` 增加按 IP 的请求频率限制，在不影响正常使用的前提下将滥用成本封顶。

## 范围

- `apps/api/src/app.ts`：在 `createApp()` 内新增 chatLimiter（与 loginLimiter/registerLimiter 同作用域，保证测试隔离）
- `app.use("/api/chat", chatLimiter, authMiddleware, chatRouter)`：chat 路由在限流器之后、`authMiddleware` 之前
- 测试：chat routes 测试补超限场景（第 N+1 次 → 429）

## 非目标

- 不新增用户级/账号级限流（IP 级先解决首要问题；后续可按 userId 做更细粒度的 token 配额）
- 不改变 SSE 事件形状或 `API_CONTRACT.md` §3.7
- 不与 FU-10 限流合并复用（chat 窗口和阈值独立配置）

## 技术细节（默认值，待用户确认）

| 参数 | 默认建议 | 说明 |
|---|---|---|
| 窗口 | 1 分钟 | 短窗口适合防刷 |
| 上限 | 30 次/分钟 | 正常对话约 10–15 轮/分钟，留余量 |
| 超限响应 | 429 `TOO_MANY_REQUESTS` | 与 login/register 同 handler |

生产反代后须设置 `trust proxy`（同 FU-10 约定）。

## 受影响模块

| 模块 | 变更 |
|---|---|
| `apps/api/src/app.ts` | 新增 chatLimiter + 挂载顺序调整 |
| `apps/api/src/__tests__/chat.test.ts` | 补超限 429 用例 |
| 文档 | `API_CONTRACT.md` §3.7 补限流说明（非契约变更，属运营约束注记） |

## 验收标准

- **AC-1**：同一 IP 1 分钟内发第 31 次 chat → 429 `TOO_MANY_REQUESTS`
- **AC-2**：第 30 次及以内正常返回 200 + SSE 流
- **AC-3**：不同 IP 互不影响
- **AC-4**：限流不影响 `/api/auth/me` 等其他端点

## 待决问题

1. 阈值 30 次/分钟是否合理？可根据真实使用数据后续调整。
2. 是否对 authenticated 用户放宽（如 admin 不受限）？默认所有角色同等限流。


## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

# OpenSpec Proposal — Phase 2 Agent 推荐与借阅

**Date:** 2026-08-22  
**Status:** pending-approval  
**Track:** OpenSpec（`AGENTS.md` §15.1：跨 web + api + shared + db + 公共 API）  
**Requirements:** [docs/requirements/2026-08-21-phase2-agent-recommend-borrow.md](../../../requirements/2026-08-21-phase2-agent-recommend-borrow.md)（approved）

Companion files:

- [spec.md](./spec.md) — 行为与契约
- [tasks.md](./tasks.md) — Apply 执行清单

---

## Why

Phase 1 只交付了影片目录。产品演示需要「说话 → 推荐卡片 → 一键借阅 → 库存真的少一本」。当前 chat/工具/租赁均为空壳，且 `API_CONTRACT.md` 把借阅写成 REST、把 chat 写成未来端点，与 `ARCHITECTURE.md` 冲突。本提案按已批准需求对齐入口、落库、SSE 与规则 Agent。

## What Changes

- 数据：`Profile`、`Rental`、`BehaviorLog`；seed `dev-user` + 代理人画像。不建 `Session`。
- API：实现 `POST /api/chat`（SSE）。不实现 `POST /api/borrow`；契约中将其降为未来端点。
- Agent：规则意图 + `recommendMovieTool` / `borrowMovieTool`；不调用 LLM。
- Web：`/chat`、SSE 消费、推荐卡片一键借阅（`movieId`）。
- 文档：`API_CONTRACT.md`、`ARCHITECTURE.md`；Apply 完成后再 archive 并更新 `PROJECT_STATUS.md` Completed。

## Capabilities

| Capability | Description |
|---|---|
| chat-sse | 认证后的 SSE 对话入口与事件协议 |
| rule-agent | 规则分类 / 规划 / 模板合成；无匹配不调工具 |
| recommend-tool | mood/scene + 库存 + 画像加权 |
| borrow-tool | 事务扣库存、进行中租赁、冲突码 |
| persistence | Profile / Rental / BehaviorLog 与 seed |
| chat-ui | `/chat` 页面与卡片 |

## Impact

- **apps/web、apps/api、packages/shared、packages/database**
- **不改** `packages/ai-sdk` 供应商调用（本阶段禁止）
- **破坏性契约：** `POST /api/borrow` 从现行节移除（尚未实现，无运行时破坏）

## Out of Scope

FU-1～FU-7：画像 CRUD、真 LLM、日志 UI、归还、JWT、REST 借阅、Session 历史。旅行与仪表盘。

## Review

用户回复 **approve** 后才可 `/opsx:apply`。批准前禁止改 `Fairy/apps`、`Fairy/packages` 业务代码与 Prisma 迁移。

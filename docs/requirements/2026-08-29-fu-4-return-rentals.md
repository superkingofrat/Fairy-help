# FU-4 归还：回补库存与还片意图（聊天文本）

**Date:** 2026-08-29
**Status:** approved
**Complexity:** moderate

## Goal

用户在 chat 里说「还 X」即可归还借出的录像带：库存回补、`Rental` 置 `RETURNED`、行为日志留痕、SSE 新增 `return` 事件。**chat 页零改动**（延续 FU-2/FU-3 的模式）；一键归还按钮及配套的 `GET /api/rentals` 拆至 **FU-8**（见 Key Decisions）。

## Background

- Phase 2 既定（[2026-08-21-phase2-agent-recommend-borrow.md](./2026-08-21-phase2-agent-recommend-borrow.md) FU 表）：FU-4 =「归还（回补库存 + 还片意图）」，基础是 `Rental` 进行中状态 + 借阅事务。
- 地基已备好：`Rental` 模型有 `RentalStatus: ACTIVE|RETURNED` 与 `@@index([userId, movieId, status])`（归还查询正中索引）；`rentalService.borrow` 事务是可镜像的模式。
- `BehaviorAction` 枚举需新增 `RETURN_SUCCESS` → 一次 Prisma 迁移（枚举加值，线上安全）。
- 架构红线（ARCHITECTURE §8）：库存变更仅经 `/api/chat` 工具链，禁止 REST 双写。
- FU-2 起 agent 为 LLM 意图（zod 校验）+ 规则 fallback；本轮在此基础上新增 return 意图。
- **拆分决策（用户 2026-08-29 拍板）**：原收敛稿中的「一键归还按钮 + `GET /api/rentals` + chat `action` 参数」整体拆至 **FU-8**（建议排 FU-6 REST borrow 之后，与租借 REST+UI 故事同期）。拆分依据：按钮对 FU-4 核心是单向依赖，核心不依赖按钮；按钮本质是租借状态展示，到 FU-6 后语义更稳。占位需求见 [2026-08-29-fu-8-return-button-ui.md](./2026-08-29-fu-8-return-button-ui.md)。

## Requirements

- **REQ-1** `rentalService.returnRental(userId, movieId)`：事务内 `findFirst` 该用户该片的 `ACTIVE` 租借（命中复合索引）→ 不存在则返回 `RENTAL_NOT_FOUND`（新错误码）；存在则 `rental.update` 置 `RETURNED`、`movie.updateMany` 库存 `increment: 1`（借出时减过 1，回补必然安全）；返回 `{ ok: true, rentalId, remainingStock }`。
- **REQ-2** shared：`ReturnErrorCode = "RENTAL_NOT_FOUND"`；`ReturnSseEvent { success, remainingStock: number|null, rentalId: string|null, code: string }`；`BEHAVIOR_ACTIONS` 增 `RETURN_SUCCESS`；`rentalSchema` 已有无需改；chat 请求体**不变**。
- **REQ-3** db：`BehaviorAction` 枚举加 `RETURN_SUCCESS`，迁移 `add_return_success_action`。
- **REQ-4** api agent：`returnMovieTool`（镜像 `borrowMovieTool`：调 `returnRental`、成功记 `RETURN_SUCCESS` 行为日志）；`classifyIntent` 新增 `return` 意图（LLM JSON `intent:"return"+movieTitle`，经既有 title-match 解析为 movieId；规则 fallback：消息含「还」**且**唯一片名匹配才判 return，否则顺延既有链——「还可以」这类歧义句安全落旧链）；`planner`/`toolDispatcher` 透传（`ToolObservation` 新 `kind: "return"`）；`synthesize` 新分支（成功 / `RENTAL_NOT_FOUND` 模板；unresolved 时在回复中列出当前 ACTIVE 借阅片名，数据来自新增 `rentalService.listActiveRentals(userId)`）。
- **REQ-5** SSE：chat 路由新增 `return` 事件下发（与 `borrow` 同型：`{ success, remainingStock, rentalId, code }`）。
- **REQ-6** 测试：service 事务测试（成功回补 / 未借先还 / 重复归还第二次 `RENTAL_NOT_FOUND`）；chat 路由测试（`return` 事件下发、库存回补断言）；intent 测试（LLM return、规则「还+片名」、歧义句不误判）；web 与既有测试回归（无改动）。
- **REQ-7** 文档：`API_CONTRACT.md` §3.7（`return` 事件、意图顺序更新）+ 错误码表加 `RENTAL_NOT_FOUND`；`ARCHITECTURE.md` 归还数据流；`PROJECT_STATUS.md` 归档阶段更新。

## Acceptance Criteria

- **AC-1**（自动化）聊天「还千与千寻」（mock LLM 或规则 fallback）→ SSE `return` 事件 `success: true`、影片库存 +1、`Rental` 置 `RETURNED`、BehaviorLog 新增 `RETURN_SUCCESS` 行。
- **AC-2**（自动化）未借先还 → `return` 事件 `success: false, code: "RENTAL_NOT_FOUND"`，库存不变。
- **AC-3**（自动化）「还可以」不触发归还（规则 fallback 不误判；LLM 路径 mock 验证）；unresolved 回复列出当前 ACTIVE 借阅片名。
- **AC-4**（自动化）迁移可应用；四包测试 + typecheck 全绿；web 零改动回归。
- **AC-5**（联调）真机：借 → 还 → 库存恢复 → 可再次借阅。

## In Scope

- `returnRental` + `listActiveRentals`；`returnMovieTool`；return 意图（LLM + 规则 fallback）
- SSE `return` 事件；`RETURN_SUCCESS` 枚举迁移
- api 三层测试与脊柱文档同步

## Out of Scope

- **一键归还按钮、`GET /api/rentals`、chat `action` 参数、chat 页任何改动（→ FU-8）**
- REST `POST /api/returns`（归还保持 chat 单一写路径；REST 借阅是 FU-6，届时是否对称加 REST 归还另议）
- 逾期计算/罚金/归还提醒；管理端代还操作页
- 按副本（copy-level）跟踪；租借历史长列表分页 UI
- `POST /api/borrow`（FU-6 不变）

## Key Decisions

| Decision | Choice | Rationale | Trade-off |
|---|---|---|---|
| 入口形态 | 仅聊天文本归还 | 最小切片（用户拍板拆分）；按钮 UI 与 rentals 查询延后 FU-8 | 归还需打字说片名，暂无按钮 |
| 拆分依据 | 按钮对核心是单向依赖，无返工成本 | FU-6 后租借状态语义更稳，UI 一次写对 | 本轮演示需口述归还 |
| 归还写路径 | 仅 chat 工具链 | 架构 §8 双写禁令 | 不提供 REST 归还 |
| 意图判定 | LLM `return` 意图；规则 fallback 含「还」且唯一片名 | 「还」字歧义（hái/huán），规则宁缺毋滥 | 规则漏判时靠 LLM 兜底 |
| 库存回补 | `updateMany` increment 1，无 guard | 借出时减过 1，回补不会越界 | 与 borrow 事务风格一致 |
| 错误码 | 新增 `RENTAL_NOT_FOUND` | 区分「没借过」与「影片不存在」 | 错误码表 +1 |
| unresolved 回复 | 列出当前 ACTIVE 借阅片名 | 用户忘了借过啥就没法还（服务端查询，无需新端点） | 多一次小查询 |

## Technical Notes

- `returnRental` 事务镜像 `borrow`：`findFirst`（复合索引命中）→ `rental.update` → `movie.updateMany({ data: { stock: { increment: 1 } } })`；`findFirst` 无记录直接返回错误码，不抛异常。
- return 意图与 borrow 共用 `movieService.listMoviesForTitleMatch` 的片名解析。
- `useSSE` 对未知事件静默忽略——`return` 事件无需前端消费（回复文本走 `text` 事件展示），FU-8 再接。
- 行为日志 `RETURN_SUCCESS` 只在成功时记（与 borrow 失败仅记 OUT_OF_STOCK 的现状对齐）。

## Risks & Open Questions

- LLM 对「还」字（hái/huán）的误判：系统提示词明确「仅在用户明确表达归还某影片时输出 return」；规则 fallback 不含片名不判 return，双保险。
- 同一句话重复归还：事务 + findFirst 保证第二次拿到 `RENTAL_NOT_FOUND`，幂等安全。

## Affected Modules

- `Fairy/packages/shared`：chatTypes（ReturnSseEvent）、rentalTypes（ReturnErrorCode）、behaviorLogSchemas（BEHAVIOR_ACTIONS）
- `Fairy/packages/database`：BehaviorAction 枚举 + 迁移
- `Fairy/apps/api`：rentalService（returnRental/listActiveRentals）、returnMovieTool、agent 三件套、chat 路由、`__tests__/`
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`
- **`Fairy/apps/web` 零改动**

## Next Step

- [x] User approves this doc
- [ ] Run `/opsx:propose`（change：`fu-4-return-rentals`）
- [ ] User reviews artifacts, then `/opsx:apply`

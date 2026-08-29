# Requirements Index

Structured requirement docs produced by grill-me sessions. Each doc feeds OpenSpec proposals.

| Date | Feature | Status | Doc |
|---|---|---|---|
| 2026-08-29 | FU-8 一键归还 UI（含 rentals 查询端点） | draft（待 grill-me） | [2026-08-29-fu-8-return-button-ui.md](./2026-08-29-fu-8-return-button-ui.md) |
| 2026-08-29 | FU-4 归还：回补库存与还片意图（聊天文本） | approved | [2026-08-29-fu-4-return-rentals.md](./2026-08-29-fu-4-return-rentals.md) |
| 2026-08-29 | FU-3 BehaviorLog 查询与流水管理页 | approved | [2026-08-29-fu-3-behavior-log-query-admin-ui.md](./2026-08-29-fu-3-behavior-log-query-admin-ui.md) |
| 2026-08-29 | FU-2 真实 LLM 替换规则意图与模板回复 | approved | [2026-08-29-fu-2-real-llm-intent-and-replies.md](./2026-08-29-fu-2-real-llm-intent-and-replies.md) |
| 2026-08-24 | FU-1 画像写接口与管理 CRUD | approved | [2026-08-24-fu-1-profile-write-admin-crud.md](./2026-08-24-fu-1-profile-write-admin-crud.md) |
| 2026-08-21 | Phase 2 Agent 推荐与借阅 | approved | [2026-08-21-phase2-agent-recommend-borrow.md](./2026-08-21-phase2-agent-recommend-borrow.md) |
| 2026-08-19 | MVP 范围确认（影片库 CRUD） | approved | [2026-08-19-mvp-scope.md](./2026-08-19-mvp-scope.md) |
| 2026-08-20 | AI 执行规范与脊柱对齐复盘 | approved | [2026-08-20-agent-execution-norms-review.md](./2026-08-20-agent-execution-norms-review.md) |

## How to add

1. Run a grill-me session: _"我要做【功能名】，用 grill-me 方式跟我聊"_
2. Agent saves `docs/requirements/YYYY-MM-DD-<feature-slug>.md`
3. After approval, run `/opsx:propose` referencing the doc

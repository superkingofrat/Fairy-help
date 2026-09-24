# Requirements Index

Structured requirement docs produced by grill-me sessions. Each doc feeds OpenSpec proposals.

Status: `approved` = 需求已批准待开发；`implemented` = 已交付归档（验收与归档记录见 PROJECT_STATUS.md Completed Modules）。

| Date | Feature | Status | Doc |
|---|---|---|---|
| 2026-09-23 | Fairy 主动生成运营建议（主动式运营洞察） | implemented | [2026-09-23-proactive-ops-suggestions.md](./2026-09-23-proactive-ops-suggestions.md) |
| 2026-09-22 | 旅行规划二期：REST 行程端点 + 历史行程回放 + 高德地图叠加 | implemented | [2026-09-22-travel-planning-phase-2.md](./2026-09-22-travel-planning-phase-2.md) |
| 2026-09-20 | 注册即建空白画像（新用户画像闭环） | implemented | [2026-09-20-register-create-blank-profile.md](./2026-09-20-register-create-blank-profile.md) |
| 2026-09-20 | chat 端点限流（防刷 LLM 账单） | implemented | [2026-09-20-chat-rate-limit.md](./2026-09-20-chat-rate-limit.md) |
| 2026-09-20 | prompt token 预算与上下文窗口裁剪 | implemented | [2026-09-20-prompt-token-budget.md](./2026-09-20-prompt-token-budget.md) |
| 2026-09-07 | FU-18 画像反向回写（偏好记忆自动沉淀 likeGenres，记忆中心五期） | implemented | [2026-09-07-profile-writeback.md](./2026-09-07-profile-writeback.md) |
| 2026-09-07 | FU-17 记忆自查入口（会话页「Fairy 记住了什么」只读面板，记忆中心四期） | implemented | [2026-09-07-memory-self-inspection.md](./2026-09-07-memory-self-inspection.md) |
| 2026-09-06 | FU-16 pgvector 记忆向量检索（记忆中心三期，混合检索） | implemented（真实 embed 端到端验收待负责人配 `EMBEDDING_API_KEY` 后补跑，见 PROJECT_STATUS Risks） | [2026-09-06-pgvector-vector-retrieval.md](./2026-09-06-pgvector-vector-retrieval.md) |
| 2026-09-06 | FU-15 memory-center 二期：记忆管理面（admin REST + 管理页） | implemented | [2026-09-06-memory-center-management.md](./2026-09-06-memory-center-management.md) |
| 2026-09-01 | FU-14 memory-center 记忆中心 | implemented | [2026-09-01-memory-center.md](./2026-09-01-memory-center.md) |
| 2026-09-01 | FU-13 旅行规划（第一期：对话行程生成） | implemented | [2026-09-01-travel-planning.md](./2026-09-01-travel-planning.md) |
| 2026-09-01 | FU-12 storeInsightTool chat 工具（第二期：对话问数） | implemented | [2026-09-01-store-insight-chat-tool.md](./2026-09-01-store-insight-chat-tool.md) |
| 2026-09-01 | FU-11 Store Insights 运营看板（第一期：管理端） | implemented | [2026-09-01-store-insights.md](./2026-09-01-store-insights.md) |
| 2026-09-01 | FU-10 账号体系闭环：注册 / 登录限速 / refresh token | implemented | [2026-09-01-fu-10-account-closure.md](./2026-09-01-fu-10-account-closure.md) |
| 2026-09-01 | FU-7 Session 表与对话历史回放 | implemented | [2026-09-01-fu-7-session-history.md](./2026-09-01-fu-7-session-history.md) |
| 2026-09-01 | FU-9 影片库浏览页（直接借阅） | implemented | [2026-09-01-fu-9-movie-library-page.md](./2026-09-01-fu-9-movie-library-page.md) |
| 2026-08-31 | FU-6 REST `POST /api/borrow` | implemented | [2026-08-31-fu-6-rest-borrow.md](./2026-08-31-fu-6-rest-borrow.md) |
| 2026-08-30 | FU-5 真实 JWT 认证（仅登录） | implemented | [2026-08-30-fu-5-jwt-auth.md](./2026-08-30-fu-5-jwt-auth.md) |
| 2026-08-29 | FU-8 一键归还 UI（含 rentals 查询端点） | implemented | [2026-08-29-fu-8-return-button-ui.md](./2026-08-29-fu-8-return-button-ui.md) |
| 2026-08-29 | FU-4 归还：回补库存与还片意图（聊天文本） | implemented | [2026-08-29-fu-4-return-rentals.md](./2026-08-29-fu-4-return-rentals.md) |
| 2026-08-29 | FU-3 BehaviorLog 查询与流水管理页 | implemented | [2026-08-29-fu-3-behavior-log-query-admin-ui.md](./2026-08-29-fu-3-behavior-log-query-admin-ui.md) |
| 2026-08-29 | FU-2 真实 LLM 替换规则意图与模板回复 | implemented | [2026-08-29-fu-2-real-llm-intent-and-replies.md](./2026-08-29-fu-2-real-llm-intent-and-replies.md) |
| 2026-08-24 | FU-1 画像写接口与管理 CRUD | implemented | [2026-08-24-fu-1-profile-write-admin-crud.md](./2026-08-24-fu-1-profile-write-admin-crud.md) |
| 2026-08-21 | Phase 2 Agent 推荐与借阅 | implemented | [2026-08-21-phase2-agent-recommend-borrow.md](./2026-08-21-phase2-agent-recommend-borrow.md) |
| 2026-08-20 | AI 执行规范与脊柱对齐复盘 | implemented | [2026-08-20-agent-execution-norms-review.md](./2026-08-20-agent-execution-norms-review.md) |
| 2026-08-19 | MVP 范围确认（影片库 CRUD） | implemented | [2026-08-19-mvp-scope.md](./2026-08-19-mvp-scope.md) |

## How to add

1. Run a grill-me session: _"我要做【功能名】，用 grill-me 方式跟我聊"_
2. Agent saves `docs/requirements/YYYY-MM-DD-<feature-slug>.md`
3. After approval, run `/opsx:propose` referencing the doc

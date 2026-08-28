## Why

Phase 1 只交付了影片目录；演示仍缺「说话 → 推荐卡片 → 一键借阅 → 库存减少」。chat/工具/租赁为空壳，且 `API_CONTRACT.md` 把借阅写成 REST、把 chat 列为未来端点，与 `ARCHITECTURE.md` 冲突。需求已批准（`docs/requirements/2026-08-21-phase2-agent-recommend-borrow.md`），现在用官方 OpenSpec change 固化范围。

## What Changes

- 新增 `POST /api/chat` SSE 对话：规则意图、`recommendMovieTool`、`borrowMovieTool`；无 AI 密钥可演示。
- 新增 Prisma `Profile`、`Rental`、`BehaviorLog` 与对齐 `dev-user` UUID 的 seed；**不**建 `Session` 表。
- 新增 `/chat` 页：SSE 文案、推荐卡片、结构化 `movieId` 借阅。
- **BREAKING（契约）:** 将现行文档中的 `POST /api/borrow` 降为未来端点；本阶段不实现 REST 借阅。运行时尚未实现该路由，无线上破坏。
- 修订 `API_CONTRACT.md`、`ARCHITECTURE.md`（规则分类器、借阅仅经工具）。

## Capabilities

### New Capabilities

- `agent-chat`: SSE 聊天入口、规则 Agent 编排、对话页
- `movie-recommend`: 按 mood/scene 与库存推荐，画像加权
- `movie-rental`: 事务借阅、进行中租赁、冲突码
- `user-profile`: 只读 Profile 与 seed
- `behavior-log`: 推荐/借阅事件只追加

### Modified Capabilities

- （无。`openspec/specs/` 尚无主规格。）

## Impact

- 代码：`Fairy/apps/web`、`Fairy/apps/api`、`Fairy/packages/shared`、`Fairy/packages/database`
- 禁止本阶段调用 `@fairy/ai-sdk` 的 `chat`/`stream`
- 认证继续 Phase 1 dev stub（`X-Dev-Role` / `Bearer dev-user`）
- 需求来源与手工草稿：`docs/requirements/2026-08-21-phase2-agent-recommend-borrow.md`、`docs/openspec/proposals/2026-08-22-phase2-agent-recommend-borrow/`

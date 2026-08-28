# Phase 2 — Agent 推荐与借阅

**Date:** 2026-08-21
**Status:** approved
**Complexity:** complex

## Goal

代理人（本阶段即 `dev-user`）在对话里用自然语言说出心情或场景，Fairy 基于影片库 mood/scene 与种子画像给出可借阅卡片，并完成真实的库存扣减与租赁记录。形成可演示的「推荐 → 一键借阅」闭环，且不依赖 AI API 密钥。

## Background

- Phase 1 已交付 Movie CRUD 与 `/admin/movies`。`PROJECT_STATUS.md` 将下一步标为 Agent 推荐与借阅。
- Prisma 现仅有 `User`、`Movie`；无 `Rental`、`Profile`、`BehaviorLog`、`Session`。
- `ARCHITECTURE.md`：用户侧一律 `POST /api/chat`；推荐/借阅经工具；库存变更须在事务内。分析书要求对话走 SSE。
- `API_CONTRACT.md` 现行有 `POST /api/borrow`，把 `POST /api/chat` 列为未来端点。本阶段以聊天入口为准，REST 借阅降级。
- 代码：agent 工具与 chat 路由为占位；`createApp()` 只挂了 `/api/movies`；`ChatPage` 未挂路由。认证为 `X-Dev-Role` / `Bearer dev-<role>`。
- 人侧角色（分析书）：绳匠（admin）维护片库；代理人被画像服务。软件侧只有一只 Fairy，旅行工具不在本阶段。

## Requirements

- **REQ-1** 挂载对话页 `/chat`（i18n），渲染 SSE 文案与推荐卡片；一键借阅发送带 `movieId` 的 `POST /api/chat`。
- **REQ-2** 实现 `POST /api/chat`（需认证 stub）：响应为 SSE。事件至少包括 `text`、`recommendation`；借阅结果走同一条流（含成功/失败与剩余库存，供卡片更新）。
- **REQ-3** 最小 Agent 为规则 only：匹配心情/场景枚举、结构化借阅、手打书名借阅、无匹配。有供应商密钥也不调用 LLM。测试禁止打真实 OpenAI/Claude。
- **REQ-4** `recommendMovieTool`：从话语解析 mood/scene（至少命中一个枚举才算推荐意图）；过滤 `stock > 0`；有 Profile 时用 `likeGenres` 等偏好加权排序；无画像仍返回标签匹配结果。无匹配影片时只推 `text` 致歉，不发空卡片列表充数。
- **REQ-5** `borrowMovieTool` 经 `RentalService` 事务：校验影片存在且 `stock > 0`；同一用户对同一影片已有进行中租赁则失败（`ALREADY_BORROWED`）；否则扣库存并写入 `Rental`。手打书名模糊匹配失败则模板致歉且不改库存。
- **REQ-6** 新增 Prisma 模型 `Profile`（字段对齐现行 `API_CONTRACT.md` Profile）、`Rental`（含进行中状态）、`BehaviorLog`（谁、何时、动作、关联实体 ID）。本阶段不建 `Session` 表。
- **REQ-7** Seed：与 `authMiddleware` 的 `dev-user` UUID 对齐的 `User` + 代理人 `Profile`（至少 `likeGenres`）。`recommendMovieTool` / `borrowMovieTool` 经 `ProfileService` 读取；无管理 CRUD、无 `PATCH /profile`。
- **REQ-8** 推荐成功、借阅成功、明确失败（如缺货）追加 `BehaviorLog`。无匹配意图不写日志。无查询 API、无流水 UI。
- **REQ-9** 无法识别为推荐或借阅时：只推引导 `text`（可说心情/场景或点卡片借阅）；不调工具。
- **REQ-10** 说话人仅为 `dev-user`（代理人画像）。绳匠继续 `/admin/movies`。不实现「给其他用户借片」。
- **REQ-11** 不实现 `POST /api/borrow`。修订 `API_CONTRACT.md`：提升 `POST /api/chat`（SSE）；将 `POST /api/borrow` 移入未来端点。同步 `ARCHITECTURE.md`（规则分类器、本阶段无 Session 持久化）与 `PROJECT_STATUS.md`（完成后登记；FU 写入 Next Steps）。
- **REQ-12** API 与前端测试覆盖：推荐过滤与加权、借阅事务与冲突、无匹配不调工具、SSE 事件形状。库存相关断言打到数据库（测试库）。

## Acceptance Criteria

- **AC-1** 以 `dev-user` 打开 `/chat`，发送含已有 mood 或 scene 的句子（如「雨天心情不好」），收到 `recommendation` 事件；卡片对应影片 `stock > 0` 且 mood/scene 与请求匹配。映射 REQ-1、REQ-2、REQ-4、REQ-10。
- **AC-2** `stock = 0` 的影片不出现在推荐卡片中。映射 REQ-4。
- **AC-3** 点击卡片借阅后：该片 `stock` 减 1；存在进行中 `Rental`；SSE 告知成功及剩余库存。映射 REQ-5。
- **AC-4** 对已有进行中租赁的同一影片再次借阅，库存不变，SSE 失败语义为 `ALREADY_BORROWED`。映射 REQ-5。
- **AC-5** 库存为 0 时借阅失败，语义为 `OUT_OF_STOCK`，不新建进行中租赁。映射 REQ-5。
- **AC-6** 无 AI 密钥时 AC-1～AC-5 仍可完成。映射 REQ-3。
- **AC-7** 发送无法识别的句子（如「今天星期几」）只收到引导 `text`，无 `recommendation`，无新的 `Rental`/`BehaviorLog`。映射 REQ-9、REQ-8。
- **AC-8** 推荐成功与借阅成功（及缺货失败）在 `BehaviorLog` 中有对应行，关联 `userId` 与影片/租赁 ID。映射 REQ-8。
- **AC-9** Seed 后 `dev-user` 能读到含 `likeGenres` 的 Profile；不提供画像编辑 UI。映射 REQ-7。
- **AC-10** `POST /api/borrow` 未作为可用业务入口交付（未挂载或明确不在契约现行节）。映射 REQ-11。
- **AC-11** `pnpm --filter=@fairy/api test` 与 `pnpm --filter=@fairy/web test` 通过。映射 REQ-12。

## In Scope

- `/chat` + SSE `POST /api/chat`
- 规则意图、`recommendMovieTool`、`borrowMovieTool`
- `Profile` / `Rental` / `BehaviorLog` 表、seed、工具只读画像
- 结构化一键借阅；手打书名模糊匹配
- 契约与脊柱文档修订（chat 现行，REST 借阅降级）
- 测试

## Out of Scope

- 旅行规划、运营仪表盘、协同过滤/向量记忆中心、到货提醒
- FU-1～FU-7（见下表）

## Follow-up tasks

批准后写入 `PROJECT_STATUS.md` Next Steps。实现前各自走 requirements / OpenSpec 或 Trellis。

| ID | 任务 | 本阶段已钉挂钩 |
|---|---|---|
| FU-1 | 画像写接口与管理 CRUD | `Profile` 表 + 工具只读 |
| FU-2 | 真实 LLM 替换规则/模板 | SSE 协议 + 合成器边界 |
| FU-3 | BehaviorLog 查询与流水 UI | 只追加写入 |
| FU-4 | 归还（回补库存 + 还片意图） | `Rental` 进行中状态 + 借阅事务 |
| FU-5 | 真实 JWT | 认证中间件上的 `userId` |
| FU-6 | REST `POST /api/borrow` | `RentalService` |
| FU-7 | `Session` 表与对话历史回放 | 单次请求 chat；可选客户端 `sessionId` 不落库 |

## Key Decisions

| Decision | Choice | Rationale | Trade-off |
|---|---|---|---|
| 用户闭环 | `/chat` + 工具，不强制 LLM | 对齐架构入口与无 key 演示 | 比纯 REST 切片大 |
| 画像 | 建表 + seed + 只读 | 后续加写接口即可联动 | 不能在 UI 改人设 |
| 传输 | SSE：`text` + `recommendation`；借阅走同流 | 换模型时前端协议可复用 | 比一次 JSON 难点测 |
| 意图与回复 | 规则 only | 无 key 可验收 | 口吻偏模板 |
| 行为日志 | 只写不展示 | 审计挂钩先钉死 | 无流水页 |
| 归还 | 只借不还 | 先跑通扣库存与重复借 | 多次演示会借空 |
| 认证 | 继续 stub | 与 JWT 并列项拆开 | 身份靠请求头 |
| 一键借阅 | 结构化 `movieId` | 规则下避免借错片 | 请求体多于纯文本 |
| REST 借阅 | 本阶段不实现 | 避免双写入口 | 脚本不能直连借 |
| 无匹配 | 模板引导、不调工具 | 避免误扣库存 | 无闲聊 |
| 说话人 | 仅 `dev-user` = 代理人 | 不拆两套身份 | 无代操作 |
| 会话 | 不落 `Session` 表 | 单轮工具足够 | 刷新丢失对话 |

## Risks & Open Questions

_无阻塞项。_

演示多次后库存可能借空（无归还）；应用 seed 重置或管理端改库存恢复。

## Affected Modules

- `Fairy/apps/api/src/agent/`、`tools/`、`services/`、`routes/chat.ts`、`app.ts`、`middleware/auth.ts`
- `Fairy/apps/web/src/components/chat/`、`hooks/useSSE.ts`、`App.tsx`、`locales/`
- `Fairy/packages/database/prisma/schema.prisma` 与 seed
- `Fairy/packages/shared/`（chat / rental / profile schemas）
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`

## Technical Notes

- **编排：** 保留 `IntentClassifier` → `Planner` → `ToolDispatcher` → `ResponseSynthesizer` 边界；分类器与合成器本阶段为规则/模板实现，FU-2 替换内部，不改 SSE 事件名。
- **工具结果：** 工具返回 `{ success, data, error }`；HTTP 聊天入口对外仍是 SSE 事件，不是一次 `{ code, data, msg }` JSON（非 SSE 错误如 401 仍用统一 JSON 信封）。
- **身份：** `res.locals.userId` 必须与 seed 的 User/Profile 主键一致（现 stub UUID：`00000000-0000-4000-8000-000000000001`）。
- **推荐上限：** 单次最多 5 张卡片，避免 SSE 过大。
- **借阅并发：** 库存扣减与 `Rental` 插入必须在同一 Prisma 事务中，并用条件更新（`stock > 0`）防止超卖。
- **契约：** 实施时重写 `API_CONTRACT.md` chat 节（请求体：`message`、可选 `movieId`、可选 `sessionId`）；`POST /api/borrow` 移出第 3 节。
- **门禁：** 跨 web + api + shared + db + 公共契约 → OpenSpec 轨（`AGENTS.md` §15.1）。

## Next Step

- [x] Grill-me 决策收敛
- [x] 用户 approve 本文档
- [x] `/opsx:propose` → CLI change [`phase2-agent-recommend-borrow`](../../openspec/changes/archive/2026-08-24-phase2-agent-recommend-borrow/)
- [x] `/opsx-apply` 实现并通过功能测试
- [x] `/opsx-archive`（主规格已同步）

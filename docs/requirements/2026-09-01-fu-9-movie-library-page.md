# FU-9 影片库浏览页（直接借阅）

**Date:** 2026-09-01（grill-me 收敛：2026-09-01；批准：2026-09-01）
**Status:** implemented（已交付并归档；真机验收与归档记录见 PROJECT_STATUS.md Completed Modules）
**Complexity:** low（web-only，零后端改动）

## Goal

为用户提供登录后可浏览的影片库独立页面：分页目录 + mood/scene 筛选 + 关键词搜索，卡片**直接借阅（REST）**；已借影片标记「已借」，归还入口保持在 chat 页。目录、搜索、REST 借阅、rentals 查询均为已交付能力，本次只补用户页与接线。

## Background

- 当前用户侧借阅只有对话入口（chat 打字 + 聊天流推荐卡片）；FU-6 交付的 REST `POST /api/borrow` 一直**无 UI 消费**（只有测试在调）。
- FU-6 需求原注「web 零改动（卡片状态与 REST 切换留给 FU-8 一次做对）」，但 FU-8 聚焦归还按钮 + rentals 查询，未做浏览页与 REST 接线。
- 影片库定位复盘：MVP 把它做成 admin CRUD 管理页（`/admin/movies`），用户侧消费点只有 chat；「打开影片栏自行借阅」是计划外新能力（用户 2026-09-01 提出），故立项 FU-9。

## Scope（grill-me 收敛后）

### API（全部复用，无新增端点）

- `GET /api/movies`：分页目录（`page`/`limit`，user+admin 可读）。
- `GET /api/movies/search`：`mood`/`scene` 逗号分隔筛选 + `keyword` 模糊匹配 + 分页（三者至少其一）。
- `POST /api/borrow`：库页借阅按钮直调（201 `{ rentalId, remainingStock }`；404 `MOVIE_NOT_FOUND` / 409 `ALREADY_BORROWED` / 409 `OUT_OF_STOCK` / 400 / 401）。
- `GET /api/rentals?status=ACTIVE`：页面首屏拉取已借集合（movieId 列表），用于「已借」标记。

### Web

- **路由与导航**：新路由 `/movies`（RequireAuth，user+admin 可见）+ 顶部导航「影片库」入口（与「对话」并列）。
- **`MovieLibraryPage`**（`components/library/`）：
  - 筛选工具条：mood/scene 标签（下拉或 chip 多选，逗号拼接）+ keyword 输入框 + 搜索/重置。
  - 目录网格：复用 `RecommendationCard` 的卡片样式（或抽共用 MovieCard），分页控件（上一页/下一页 + 页码）。
  - 借阅按钮：点击调 REST `POST /api/borrow`；成功 → 卡片标记「已借」+ 轻提示（成功文案），并 refetch rentals 校正；失败（`ALREADY_BORROWED`/`OUT_OF_STOCK`）→ 卡片内错误提示，无 500、不弹聊天。
  - 已借标记：`GET /api/rentals?status=ACTIVE` 的 movieId 集合；已借卡片借阅按钮置灰显示「已借」。
- **API 客户端**：`movieApi` 增 `borrowMovie(movieId)`（Bearer + 401 处理，复用 `fetch` 约定）——或归入 `rentalsApi`。
- **i18n**：`nav.movies`、`library.*`（title、search、mood、scene、keyword、borrow、borrowed、error 等键）。
- **测试**：页面渲染与空态、筛选请求载荷（mood/scene/keyword 组装到 search URL）、分页、借阅成功切换「已借」、借阅失败提示、已借集合标记置灰。

### 归还

- **保持在 chat 页**（「我的借阅」条 + 推荐卡片「归还」按钮）。库页**不提供**归还按钮——红线「归还库存变更仅经 chat 工具链」不变。

## Out of Scope

- 库页归还按钮 / REST 归还写端点；admin 代还 UI；逾期/罚金/提醒；收藏/心愿单；排序（评分/热度）；库页展示完整借阅历史（「我的借阅」仅 ACTIVE）。

## Key Decisions（grill-me 收敛）

| Decision | Choice | Rationale |
|---|---|---|
| 页面形态 | 独立导航页 `/movies` | 与 chat 页并列、职责清晰；不加重 chat 页 |
| 借阅通道 | 库页直调 REST `POST /api/borrow` | 页面不在聊天流；REST 即 FU-6 预留用途；聊天卡片保持 SSE 不变 |
| 浏览能力 | 分页 + mood/scene 筛选 + 关键词搜索 | 全部复用 `/api/movies/search`，零后端改动 |
| 已借/归还 | 标记已借，归还仍在 chat 页 | 双写禁令；状态取自 `GET /api/rentals`，首屏即有 |

## Affected Modules

- `Fairy/apps/web`：App.tsx（路由 + 导航）、新增 `components/library/MovieLibraryPage.tsx`、`lib/movieApi.ts`（或 rentalsApi，增 borrowMovie）、i18n（zh-CN）、`__tests__/`
- 后端（apps/api）与 shared（packages/shared）：**无改动**

## Acceptance Criteria

- **AC-1** 登录 user 顶部导航出现「影片库」，`/movies` 打开分页目录（admin 同样可见）。
- **AC-2** mood/scene/keyword 筛选组合生效，请求打到 `/api/movies/search` 且参数正确；重置后回分页目录。
- **AC-3** 点击借阅 → REST 201 → 卡片标记「已借」、库存 -1（DB 校验：该 rental `ACTIVE` + 影片 `stock-1`）。
- **AC-4** 已借卡片按钮置灰「已借」；对同一部片重复借（或并发）→ 卡片内友好提示，无 500。
- **AC-5** 已借状态跨页一致：chat 页还片后回到 `/movies`，该卡片恢复可借（mount 时 refetch rentals）。
- **AC-6** 借阅流水：库页 REST 借入 → 行为流水页出现 `BORROW_SUCCESS`（与 chat 借阅同事务同日志，FU-6 已验证）。

## Next Step

- [x] grill-me 收敛（2026-09-01，四项决策已定）
- [ ] 用户批准
- [ ] `/opsx:propose` → approve → apply

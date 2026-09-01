# FU-9 影片库浏览页 — Design

## Context

See proposal.md — Why。后端四个能力（目录、搜索、REST 借阅、rentals 查询）均已交付并有 web 客户端（`fetchMovies`/`searchMovies` 在 `lib/movieApi.ts`，`listRentals` 在 `lib/rentalsApi.ts`）；缺的是用户侧 `/movies` 页面与 REST 借阅接线。红线：归还仍只经 chat 工具链。

## Goals / Non-Goals

- Goals: 一个自包含的 `MovieLibraryPage`；筛选/搜索/分页/借阅/已借标记；测试覆盖。
- Non-Goals: 不改后端与 shared；不引入新依赖；不做库页归还按钮；不做收藏/排序/详情弹层。

## Decisions

1. **借阅走 REST `POST /api/borrow`（新增 `borrowMovie` 客户端）**
   库页不在聊天流里，REST 即 FU-6 预留用途；聊天卡片保持 SSE 不变（改动面最小，两条路径语义已由 FU-6 统一事务保证）。
   - Alternative: 复用 `postChat` — 会让库页依赖聊天流、出现无关 SSE 事件，排除。
2. **已借集合来源 `GET /api/rentals?status=ACTIVE`（页面 mount 时拉取）**
   与 chat 页「我的借阅」同源；本地记账刷新即丢，不采用。
3. **卡片样式复用/抽取 `MovieCard`**
   `RecommendationCard` 是 chat 专用（含 SSE 回调），不直接复用；从它抽取纯展示部分成本高于写一个轻量 `MovieCard`（标题/导演/年份/mood/scene/库存/按钮），库页自用。按钮状态由页面持有（`idle | borrowing | borrowed | error`）。
   - Alternative: 直接复用 `RecommendationCard` — 其 props 耦合 chat 流与归还逻辑，排除。
4. **筛选即搜（受控输入 + 防抖/提交即请求）**
   搜索/筛选条件变化组装 URL query 打到 `/api/movies/search`（mood/scene 逗号拼接，keyword 模糊匹配）；无筛选时回 `GET /api/movies` 分页目录。重置按钮清空条件回目录。
5. **借阅成功/失败反馈在卡片内**
   成功 → 按钮变「已借」+ 顶部轻提示（成功文案）；失败 → 该卡片错误文案（映射 `ALREADY_BORROWED`/`OUT_OF_STOCK`/401 登出）。不弹聊天、不跳 chat 页。

## Risks / Trade-offs

- [已借集合与目录分页不同步] → 借阅成功/失败后对 rentals 做一次 refetch，保持标记一致。
- [并发双击借阅] → 卡片级 pending 状态禁点（`borrowing`）。
- [REST 401（token 过期）] → 复用既有 401 登出约定（authStore clear + 跳登录）。

## Migration Plan

无数据迁移。前端独立路由新增，聊天/管理页不受影响；部署即上线。

## Open Questions

无。

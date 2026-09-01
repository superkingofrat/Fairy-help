# FU-9 影片库浏览页（直接借阅）

## Why

用户侧借阅目前只有对话入口（chat 打字 + 聊天流推荐卡片）；FU-6 交付的 REST `POST /api/borrow` 一直无 UI 消费，影片目录（`GET /api/movies`、`GET /api/movies/search`）也只在 admin 管理页出现过。用户需要一个「打开影片栏自行借阅」的独立浏览页——后端能力全部就绪，本次只补用户页与接线，是纯 web 改动。

## What Changes

- 新增用户可见路由 `/movies`（RequireAuth，user+admin）+ 顶部导航「影片库」入口。
- 新增 `MovieLibraryPage`：分页目录 + mood/scene 标签筛选 + keyword 搜索（复用 `GET /api/movies` 与 `GET /api/movies/search`）+ 每部影片的借阅按钮。
- 借阅按钮直调 REST `POST /api/borrow`（201 成功；`ALREADY_BORROWED`/`OUT_OF_STOCK` 等失败在卡片内提示，不弹聊天、无 500）。
- 已借标记：页面拉取 `GET /api/rentals?status=ACTIVE` 得到已借 movieId 集合，已借卡片按钮置灰显示「已借」；在 chat 页归还后回到 `/movies` 状态自动恢复。
- web API 客户端新增 `borrowMovie(movieId)`（Bearer + 401 处理）；i18n 新增 `nav.movies` 与 `library.*` 键。
- **不新增**任何后端端点；**不提供**库页归还按钮（归还仍只经 chat 工具链，双写禁令不变）。

## Capabilities

- **New Capabilities**: 无
- **Modified Capabilities**:
  - `movie-rental` — 新增两条需求：影片库页提供可筛选目录与直接借阅入口；库页标记已借影片且状态跨页一致。

## Impact

- **代码**：`Fairy/apps/web`（App.tsx 路由+导航、新 `components/library/MovieLibraryPage.tsx`、`lib/movieApi.ts` 或 `rentalsApi` 增 borrowMovie、i18n、`__tests__/`）。后端与 shared **零改动**。
- **API**：无新端点；复用 `GET /api/movies`、`GET /api/movies/search`、`POST /api/borrow`、`GET /api/rentals?status=ACTIVE`（均为已交付契约，API_CONTRACT.md 无需变更）。
- **文档**：`ARCHITECTURE.md` §5/§8 可补一条「用户侧影片库浏览页消费 REST 借阅旁路」的数据流注记；`API_CONTRACT.md` 无变更。

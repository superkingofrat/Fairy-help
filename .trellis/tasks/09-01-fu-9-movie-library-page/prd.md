# FU-9 影片库浏览页（直接借阅）

## Goal

为用户提供登录后可浏览的影片库独立页面：分页目录 + mood/scene 筛选 + 关键词搜索，卡片直接借阅（REST）；已借影片标记「已借」，归还入口保持在 chat 页。唯一来源：`docs/requirements/2026-09-01-fu-9-movie-library-page.md`（已批准，grill-me 收敛四项决策）。**纯 web 改动，零后端/shared 改动**。

## Requirements

### API（全部复用，无新增端点）

- `GET /api/movies`：分页目录（page/limit，user+admin 可读）。
- `GET /api/movies/search`：mood/scene 逗号分隔筛选 + keyword 模糊匹配 + 分页（三者至少其一）。
- `POST /api/borrow`：库页借阅按钮直调（201 `{ rentalId, remainingStock }`；404/409/400/401）。
- `GET /api/rentals?status=ACTIVE`：首屏拉取已借 movieId 集合，用于「已借」标记。

### Web

- 新路由 `/movies`（RequireAuth，user+admin）+ 顶部导航「影片库」入口（与「对话」并列）。
- `MovieLibraryPage`（components/library/）：筛选工具条（mood/scene 标签 + keyword 输入 + 搜索/重置）、目录卡片网格、分页控件。
- 借阅按钮：调 REST `POST /api/borrow`；成功 → 卡片标记「已借」+ 轻提示 + refetch rentals；失败（ALREADY_BORROWED/OUT_OF_STOCK）→ 卡片内错误提示，无 500。
- 已借标记：`GET /api/rentals?status=ACTIVE` 的 movieId 集合；已借卡片按钮置灰显示「已借」。
- API 客户端：`movieApi` 或 `rentalsApi` 增 `borrowMovie(movieId)`（Bearer + 401 处理）。
- i18n：`nav.movies`、`library.*` 键（zh-CN）。

## Acceptance Criteria

- [ ] AC-1 登录 user/admin 顶部导航出现「影片库」，`/movies` 打开分页目录
- [ ] AC-2 mood/scene/keyword 筛选组合生效（请求打到 `/api/movies/search` 且参数正确）；重置后回分页目录
- [ ] AC-3 点借阅 → REST 201 → 卡片标记「已借」+ 库存 -1（DB：rental `ACTIVE` + `stock-1`）
- [ ] AC-4 已借卡片按钮置灰「已借」；重复借 → 卡片内友好提示，无 500
- [ ] AC-5 跨页一致：chat 页还片后回 `/movies`，该卡片恢复可借（mount refetch）
- [ ] AC-6 库页 REST 借入 → 流水页出现 `BORROW_SUCCESS`（与 chat 借阅同事务同日志）

## Notes

- OpenSpec 轨：需求已批准，下一步 `/opsx:propose` → 用户 approve → apply。
- 设计/实现细节由 OpenSpec proposal + tasks.md 承载（本 task 保持 PRD-only）。
- 归还红线：库页不提供归还按钮；归还仍只经 chat 工具链（`action: "return"`）。

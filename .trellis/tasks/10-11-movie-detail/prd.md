# 影片库影片详情查看

来源需求：[docs/requirements/2026-10-11-movie-detail.md](../../../docs/requirements/2026-10-11-movie-detail.md)（2026-10-11 负责人批准，Status: approved；5 项待决问题均按推荐默认定稿）。

## Goal

影片库（`/movies`）卡片可点击打开该影片的详情模态框，完整展示影片已有信息（封面、片名、年份·导演、类型、心情、场景、库存、台词、简介）；详情内可直接借阅且与卡片借阅同一状态源；关闭支持关闭按钮/遮罩/Esc 三种方式。详情数据取自列表响应中已有的完整 `Movie` 对象——零新增 API 请求、零新路由、零 `API_CONTRACT.md` 变更、零 schema/零后端改动。

## Requirements

- `MovieCard.tsx`：新增可选 prop `onOpenDetail?: (movie: Movie) => void`；传入时卡片可点区域（封面 + 文字信息区）可点击打开详情；借阅按钮区域点击 `stopPropagation` 不冒泡；可点区域用 `<button type="button">` 包裹保证键盘可达，aria-label 走 i18n 含片名。未传 `onOpenDetail` 时行为与现状逐字一致（管理端等潜在复用方零影响）。
- 新建 `apps/web/src/components/library/MovieDetailModal.tsx`：遮罩 + 面板，视觉约定复用管理端既有模态（`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4` + 内层 `max-h-[90vh] w-full overflow-y-auto rounded-lg bg-white p-6 shadow-xl`）；布局左封面右信息（`flex-col`，`sm:` 起并排）。
  - 封面渲染复用封面需求既有约定：`coverUrl` 非空渲染 `<img>`（`onError` → 纯 CSS 占位：渐变底 + 片名首字、`aria-hidden`），不显示破图。
  - 信息区：片名、`year · director`、`genres`、`mood`、`scene`、`stock/totalStock`、`quote`（类型 `string | null`，为 null 时不渲染该行）、`description`；不展示 `createdAt/updatedAt`。
  - 操作区：借阅按钮（禁用条件/文案/状态与卡片一致，点击调同一 `onBorrow`）+ 关闭按钮。
  - 关闭：关闭按钮、点击遮罩、Esc（`useEffect` 绑 `window` keydown，卸载解绑）三种；`role="dialog"` + `aria-modal="true"` + i18n aria-label。
- `MovieLibraryPage.tsx`：新增 `detailMovie: Movie | null` state；卡片 `onOpenDetail` 开/关；把该影片当前 `CardState` 与 `handleBorrow` 透传进详情组件，使详情内借阅与卡片状态同源（借阅成功后卡片按钮同步已借、提示语一致）。
- i18n：`apps/web/src/locales/zh-CN.json` 新增 `library.detail.*` 键（标题、关闭、字段标签、可点区域 aria-label 等），无硬编码中文。
- 测试：新建 `MovieDetailModal.test.tsx`（全部字段渲染、quote null 不渲染该行、封面 onError 降级、三种关闭均回调、借阅透传 `onBorrow(movie.id)`）；`MovieCard.test.tsx` 补例（点击可点区域调 `onOpenDetail(movie)`、点击借阅按钮不触发 `onOpenDetail`）；`MovieLibraryPage.test.tsx` 补例（点击卡片打开详情且字段可见、Esc 关闭回列表）。
- 文档：`ARCHITECTURE.md` §8 决策行（模态框载体 + 零请求理由）+ §9 `components/library/` 行更新；`PROJECT_STATUS.md` 交付后更新（Completed Modules + Next Steps 移项）；需求索引状态流转。`API_CONTRACT.md` 不变。

## Constraints

- AGENTS §15.1 Trellis 轨（单 app `apps/web`，无公共契约变更）；§4 前端约定（函数式组件、i18n 唯一来源、显式处理加载/错误/空态、组件短小）；§0 用户体验保障（不得暴露破图/原始错误）。
- 复用现有模式：Tailwind 类 + 项目既有纯 CSS 风格（不引图表库/模态库）；测试沿用 `vi.mock` + testing-library 既有写法；不引入新依赖。
- 详情数据一律来自列表响应已有的 `Movie` 对象，不得新增 `fetchMovie(id)` 或任何请求；不得加路由。

## Acceptance Criteria

- [ ] AC-1：卡片可点区域（封面 + 文字信息区）点击打开该影片详情，内容与列表数据一致；借阅按钮点击不打开详情（事件不冒泡）。
- [ ] AC-2：详情展示全部字段：封面大图、片名、年份·导演、类型、心情、场景、库存、台词（null 时不渲染该行）、简介。
- [ ] AC-3：封面 `onError` 时降级为纯 CSS 占位，无破图、无未捕获错误。
- [ ] AC-4：详情内借阅与卡片借阅同一状态源——详情内借阅成功后卡片按钮同步已借、提示语一致；无库存时按钮禁用。
- [ ] AC-5：关闭三种方式齐全（按钮/遮罩/Esc）；关闭后列表筛选/分页/关键字状态不丢。
- [ ] AC-6：模态 `role="dialog"` + `aria-modal="true"` + i18n aria-label；可点区域为 `<button>` 键盘可达；全部文案走 `zh-CN.json`，无硬编码中文。
- [ ] AC-7：单测覆盖（详情字段渲染、quote null、封面降级、三种关闭、借阅透传、卡片点击打开、借阅按钮不冒泡）；既有 web 测试零回归。
- [ ] AC-8：`pnpm --filter=@fairy/web test` 全绿 + `pnpm --filter=@fairy/web typecheck` + `pnpm lint` + `pnpm format:check` 通过（format:check 按封面需求既有 CRLF 环境口径记录）。
- [ ] AC-9：`git diff` 仅 `apps/web` 与文档（零后端/零契约/零 schema）；真机（§15.4 双 dev server，`user@fairy.local`）：点击卡片开详情、三种方式关闭、详情内借阅闭环后卡片状态同步、翻页/筛选/搜索后入口与布局稳定。

## Notes

- 关键事实（批准前已核查）：`packages/shared/src/types/movieTypes.ts` 的 `Movie` DTO 已含全部详情字段；`apps/api/src/services/movieService.ts:107` `listMovies` 经 `toMovie`（同文件 53–73 行）下发完整对象（列表响应即带 `description`/`quote`/`genres`）；`API_CONTRACT.md` §3.3 `GET /movies/:id` 早已存在但 web 端无消费方——本需求不消费它。
- 封面降级逻辑与 `MovieCard.tsx` 现有实现同构；`MovieDetailModal` 需要自己的 `coverFailed` state（与卡片各自独立，互不影响）。
- dev 库现有 47 部影片中 39 部有封面（`/covers/...`）、8 部 `coverUrl` 为 null——真机验收可同时覆盖有封面/无封面两条路径。
- 轻量任务，PRD-only 有效；实现计划直接按本 PRD 的 Requirements 顺序执行。

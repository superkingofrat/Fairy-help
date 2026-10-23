# 影片库影片详情查看（点击卡片打开详情）

- 状态：implemented（2026-10-11 负责人批准，采用全部推荐默认；Trellis task `10-11-movie-detail`；2026-10-11 实现 + 单测 + 真机验收通过，见文末「实现与验收记录」）
- 日期：2026-10-11
- 负责人：Flores
- 前置：FU-9 影片库浏览页已交付（`MovieLibraryPage` + `MovieCard`）；封面展示需求已交付（`MovieCard` 已有封面 `<img>` + onError 降级占位）；39 部绝区零影片已导入 dev 库（2026-10-11）

## 背景 / 问题

负责人在影片库（`/movies`）点击影片卡片没有任何反应：「影片库没有详情诶，点不开」。

代码事实：详情所需的**数据链路早已完备，缺的只有前端详情界面**——

- `packages/shared/src/types/movieTypes.ts` 的 `Movie` DTO 已含全部详情字段：`id / title / director / year / mood[] / scene[] / genres[] / quote / stock / totalStock / coverUrl / description / createdAt / updatedAt`；
- `apps/api/src/services/movieService.ts:107` `listMovies` 经 `toMovie`（同文件 53–73 行）下发**完整**影片对象——列表响应里就带 `description`、`quote`、`genres`，并非裁剪字段，打开详情**不需要再发请求**；
- `API_CONTRACT.md` §3.3 `GET /movies/:id` 早已存在（`apps/api/src/routes/movies.ts:23` → `movieController.ts:42` `getMovieHandler` → `movieService.ts:205` `getMovieById`，404 返回 `MOVIE_NOT_FOUND`），但 web 端 `apps/web/src/lib/movieApi.ts` 没有对应客户端方法，也没有任何界面消费它；
- `apps/web/src/components/library/MovieCard.tsx` 当前是纯展示 `<article>`：除借阅按钮外整卡无点击入口，`MovieLibraryPage` 也没有详情状态或详情组件。

即：本需求是**纯前端展示功能**——详情数据已在列表响应中，零新增请求、零新路由、零公共契约变更、零 schema/零后端改动，按 AGENTS §15.1 走 **Trellis 轨**（单 app：`apps/web`）。

## 目标

1. 影片库卡片可点击打开该影片的详情视图，完整展示影片已有信息：封面、片名、年份·导演、类型、心情、场景、库存、台词、简介。
2. 详情用列表响应中已有的数据渲染，不新增 API 请求、不加路由、不改 `API_CONTRACT.md`。
3. 详情内可直接借阅，与卡片借阅同一状态源——借阅成功后卡片按钮状态同步刷新，不出现「详情里借了、卡片还显示可借」的不一致。
4. 关闭交互完备（关闭按钮 / 点击遮罩 / Esc 三种），可访问性达标（`role="dialog"` + `aria-modal` + i18n aria-label），不向用户暴露破图或原始错误。
5. 卡片既有信息与借阅交互零回归；筛选、分页、关键字在打开/关闭详情后保持不丢。

## 范围

- **卡片点击入口（apps/web）**：
  - `MovieCard.tsx`：新增可选 prop `onOpenDetail?: (movie: Movie) => void`；传入时卡片可点区域（封面 + 文字信息区）可点击打开详情，借阅按钮区域点击**不冒泡**到打开详情（`stopPropagation`）。可点区域用 `<button type="button">` 包裹以保证键盘可达，aria-label 走 i18n（含片名）。
- **详情组件（apps/web）**：
  - 新建 `apps/web/src/components/library/MovieDetailModal.tsx`：遮罩 + 面板，视觉约定复用管理端既有模态（`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4` + 内层 `max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl`）；布局为左封面右信息（移动端 `flex-col` 堆叠、`sm:` 起并排）。
  - 封面渲染复用封面需求既有约定：`coverUrl` 非空渲染 `<img>`、`onError` 降级为纯 CSS 占位（渐变底 + 片名首字、`aria-hidden`），不显示破图。
  - 信息区展示：片名、`year · director`、`genres`、`mood`、`scene`、`stock/totalStock`、`quote`（类型上可为 `null`，为 null 时不渲染该行）、`description`。
  - 操作区：借阅按钮（禁用/文案/状态与卡片一致，点击调用同一 `onBorrow`）+ 关闭按钮。
  - 关闭：关闭按钮、点击遮罩、按 Esc（`useEffect` 绑 `window` `keydown`，卸载时解绑）三种方式。
- **页面接线（apps/web）**：
  - `MovieLibraryPage.tsx`：新增 `detailMovie: Movie | null` state，卡片 `onOpenDetail` 打开/关闭；把该影片当前的 `CardState`（借阅状态）与 `handleBorrow` 透传进详情组件，使详情内借阅与卡片状态同源。
- **i18n**：`apps/web/src/locales/zh-CN.json` 新增 `library.detail.*` 键（标题、关闭、各字段标签、借阅入口 aria-label 等），全部走唯一来源，无硬编码中文。
- **测试（apps/web）**：
  - 新建 `MovieDetailModal.test.tsx`：渲染全部字段、quote 为 null 时不渲染该行、封面 onError 降级、三种关闭方式均回调、借阅按钮透传 `onBorrow(movie.id)`。
  - `MovieCard.test.tsx` 补例：点击卡片可点区域调用 `onOpenDetail(movie)`；点击借阅按钮**不**触发 `onOpenDetail`。
  - `MovieLibraryPage.test.tsx` 补例：点击卡片打开详情（字段可见）、Esc 关闭后回到列表。
- **验证**：`pnpm --filter=@fairy/web test`、`pnpm --filter=@fairy/web typecheck`、`pnpm lint`、`pnpm format:check`（沿用封面需求口径：`core.autocrlf=true` 检出 CRLF 属既有全仓环境现象，本次改动文件须与 prettier 输出逐字一致）。
- **文档**：`ARCHITECTURE.md` §8 决策行（详情载体选型与零请求理由）+ §9 `components/library/` 行更新；`PROJECT_STATUS.md` 交付后更新（Completed Modules + Next Steps）；`docs/requirements/README.md` 索引登记。`API_CONTRACT.md` **不变**。

## 非目标

- 不改 `API_CONTRACT.md`、`packages/shared`、`apps/api`、`packages/database`（详情数据与单查端点均已在契约中，无需任何变更）。
- 不加 `/movies/:id` 路由、不做深链接/分享/刷新保持（模态关闭即回列表；如负责人要深链接，批准时改用独立路由形态，见待决问题 1）。
- 不为 web 端新增 `fetchMovie(id)` 客户端方法（列表响应已含全部字段；`GET /movies/:id` 保持仅供未来深链接或管理场景使用）。
- 不做详情内相关推荐、同类型影片、评分/评论/收藏。
- 不改管理端影片表格（`MoviesAdminPage`）与聊天推荐卡（`RecommendationCard`）的展示。
- 不做焦点陷阱（focus trap）库与移动端全屏抽屉；仅 Esc + aria 属性（管理端模态同样未做焦点陷阱，保持一致）。
- 不改影片库的筛选/分页/搜索逻辑与卡片网格列数。

## 受影响模块

- `apps/web/src/components/library/MovieDetailModal.tsx`（新建：模态 + 封面降级 + 字段渲染 + 三种关闭 + 借阅透传）
- `apps/web/src/components/library/MovieCard.tsx`（新增可选 `onOpenDetail` 与可点区域，借阅按钮不冒泡）
- `apps/web/src/components/library/MovieLibraryPage.tsx`（`detailMovie` state + 详情接线）
- `apps/web/src/components/library/MovieDetailModal.test.tsx`（新建）、`MovieCard.test.tsx`（补例）、`MovieLibraryPage.test.tsx`（补例）
- `apps/web/src/locales/zh-CN.json`（`library.detail.*` 键）
- 文档：`ARCHITECTURE.md`、`PROJECT_STATUS.md`、`docs/requirements/README.md`
- **不涉及**：`packages/shared`、`apps/api`、`packages/database`、`API_CONTRACT.md`

## 验收标准

- AC-1：影片库卡片可点区域（封面 + 文字信息区）点击后打开该影片详情，展示内容与列表数据一致；借阅按钮点击不打开详情（事件不冒泡）。
- AC-2：详情展示全部已有字段：封面大图、片名、年份·导演、类型（genres）、心情（mood）、场景（scene）、库存（stock/totalStock）、台词（quote，null 时不渲染该行）、简介（description）。
- AC-3：封面加载失败（`onError`）时降级为纯 CSS 占位，不显示破图、不抛未捕获错误（复用封面需求约定）。
- AC-4：详情内借阅按钮与卡片借阅同一状态源——详情内借阅成功后，卡片按钮同步变为已借状态、顶部提示语与卡片路径一致；无库存时按钮禁用。
- AC-5：关闭交互三种齐全：关闭按钮、点击遮罩、按 Esc；关闭后列表的筛选/分页/关键字状态不丢。
- AC-6：可访问性与 i18n：详情模态 `role="dialog"` + `aria-modal="true"` + aria-label 走 i18n；可点区域为 `<button>`（键盘可达）；全部文案走 `zh-CN.json`，无硬编码中文、无未翻译 key 上屏。
- AC-7：单测覆盖：详情字段渲染、quote null 不渲染该行、封面 onError 降级、三种关闭方式均触发关闭回调、详情借阅透传、卡片点击打开与借阅按钮不冒泡；既有 web 测试零回归。
- AC-8：`pnpm --filter=@fairy/web test` 全绿 + `pnpm --filter=@fairy/web typecheck` + `pnpm lint` + `pnpm format:check` 通过（后者按封面需求既有 CRLF 环境口径记录）。
- AC-9：零后端/零契约/零 schema 改动（`git diff` 仅 `apps/web` 与文档）；真机（§15.4 双 dev server，`user@fairy.local`）：点击卡片打开详情、Esc/遮罩/按钮三种方式关闭、详情内借阅闭环后卡片状态同步、翻页/筛选/搜索后详情入口与布局稳定。

## 待决问题（2026-10-11 已定稿，见下方决策记录）

1. **详情载体形态**：**推荐模态框**（`MovieDetailModal`，数据取自列表响应，零请求零路由，符合「点不开 → 点得开」的直觉，管理端已有模态先例）。备选：独立路由 `/movies/:id`（可分享/刷新保持，但需新增 `fetchMovie(id)`、路由与 `RequireAuth` 接线、加载态与 404 态，成本更高；且仍为零契约变更，因 `GET /movies/:id` 早已存在）。**如需深链接请在批准时改为独立路由。**
2. **详情内是否提供借阅**：**推荐提供**（详情是用户的决策点，闭环借阅体验最顺；与卡片同状态源，实现增量小）。如求范围最小可去掉（AC-4 相应收窄为「详情内不提供借阅」）。
3. **打开详情的点击区域**：**推荐整卡可点**（封面 + 文字信息区，借阅按钮除外），键盘可达用 `<button>` 包裹。备选：仅封面 + 标题可点（更保守、避免误触，但发现性差）。
4. **关闭方式**：**推荐关闭按钮 + 遮膜点击 + Esc 三种**（Esc 需 `useEffect` 绑 `window` keydown，卸载解绑）。可精简为仅按钮 + 遮罩。
5. **详情内是否展示 `createdAt/updatedAt`**：推荐不展示（对租片用户无意义，属管理信息）。如需要可在批准时加入。

## 决策记录（2026-10-11 批准时定稿）

1. **详情载体形态**：**模态框**（`MovieDetailModal`），数据取自列表响应中已有的完整 `Movie` 对象——零新增 API 请求、零新路由、零 `API_CONTRACT.md` 变更；视觉约定复用管理端既有模态（`fixed inset-0 z-50 … bg-black/40` 遮罩 + `rounded-lg bg-white p-6 shadow-xl` 面板），布局左封面右信息、移动端堆叠。深链接/分享/刷新保持为非目标（如后续需要，另立需求走独立路由，届时复用早已存在的 `GET /movies/:id`）。
2. **详情内提供借阅**：提供。借阅按钮与卡片借阅**同一状态源**（`MovieLibraryPage` 的 `cards` state + `handleBorrow` 透传），借阅成功后卡片按钮同步变为已借、提示语一致，杜绝「详情里借了、卡片还显示可借」的不一致。
3. **打开详情的点击区域**：整卡可点（封面 + 文字信息区），借阅按钮区域点击 `stopPropagation` 不冒泡；可点区域用 `<button type="button">` 包裹保证键盘可达，aria-label 走 i18n 含片名。
4. **关闭方式**：关闭按钮 + 点击遮罩 + Esc 三种；Esc 经 `useEffect` 绑 `window` keydown、卸载时解绑；模态带 `role="dialog"` + `aria-modal="true"` + i18n aria-label。
5. **不展示 `createdAt/updatedAt`**（管理信息，对租片用户无意义）。
6. **轨道**：**Trellis 轨**（单 app `apps/web`、无公共契约变更、无 schema 变更）——Trellis task `10-11-movie-detail` → `task.py start` → 实现 → 真机验收。

## 实现与验收记录（2026-10-11）

按 §15.1 Trellis 轨门禁实现：需求文档 approved → Trellis task `10-11-movie-detail`（`task.py create` + `set-scope web` + `task.py start`）→ 实现 → 单测/typecheck/lint → 真机验收 → 脊柱同步。完整真机验收记录见 `.trellis/tasks/10-11-movie-detail/acceptance.md`。

**代码改动（仅 `apps/web`，零请求/零路由/零契约/零 schema/零后端改动）**：

- 新建 `apps/web/src/components/library/MovieDetailModal.tsx`：`role="dialog"` + `aria-modal="true"` + i18n aria-label；关闭按钮/点击遮罩/Esc 三种关闭（Esc 经 `useEffect` 绑 `window` keydown、卸载解绑）；封面大图 `onError` 降级为纯 CSS 占位（复用封面需求约定：渐变底 + 片名首字 + `aria-hidden`）；展示封面/片名/年份·导演/类型/心情/场景/库存/台词/简介，`quote` 为 null 不渲染该行，不展示 `createdAt`/`updatedAt`（决策 5）。
- `apps/web/src/components/library/MovieLibraryPage.tsx`：新增 `detailMovieId` state 与 `cardStateFor` 助手；详情影片由当前 `movies` 按 id **派生**（不存整份对象），借阅后列表刷新即实时更新；卡片接线 `onOpenDetail`，末尾挂载 `MovieDetailModal`（借阅与关闭分别透传 `handleBorrow` 与 `closeDetail`）。
- `apps/web/src/components/library/MovieCard.tsx`：新增可选 `onOpenDetail` prop；传入时封面 + 文字信息包进一个真实 `<button type="button">`（aria-label 走 i18n 含片名，原生键盘可达与读屏播报），借阅按钮为其**兄弟节点**——点借阅结构上不可能打开详情，无需 `stopPropagation`（决策 3 的落地方式较定稿更稳）；未传时渲染 `<div>`，行为与改动前一致。
- 新建 `apps/web/src/components/library/borrowLabel.ts`：借阅按钮文案纯函数（卡片与详情两处消费）；原置于 `MovieCard.tsx` 会触发 `react-refresh/only-export-components` 警告，而 web lint 为 `--max-warnings 0`，按 `components/fairy/expressions.ts` 既有先例拆为独立文件（i18n 键不变）。
- `apps/web/src/locales/zh-CN.json`：新增 `library.openDetail`（`查看《{title}》详情`）与 `library.detail.title/close/genres/quote/description` 5 键，`library.stock`/`library.mood`/`library.scene`/`library.cover.alt` 复用既有键。

**验证**：web 包 **171 测试全绿**（新建 `MovieDetailModal.test.tsx` 10 例 + `MovieCard.test.tsx` 补 2 例 + `MovieLibraryPage.test.tsx` 补 2 例，既有用例零回归）+ web typecheck + `pnpm lint` 8/8；`format:check` 按封面需求既有口径——全仓既有文件报 CRLF 属 `core.autocrlf=true` 的既有环境现象（master 同样失败），本次 8 个改动文件经 prettier 逐字核对干净（含修掉两处 prettier 格式差异）。

**真机验收**（§15.4 双 dev server，`user@fairy.local`，Neon dev 库，浏览器 DOM/ARIA/`naturalWidth` 断言）：AC-1 卡片点击打开详情（12 个触发按钮实测）；AC-2 全字段渲染（《第一杯土》库存 `2/4`、台词/简介齐全；老片《盗梦空间》同样齐全）；AC-3 封面 `naturalWidth` 182/292、`coverUrl` 为 null 走占位（首字「盗」）；AC-4 详情内借阅 → 提示「借阅成功」+ 卡片与详情 2 个禁用「已借」+ 库存 `2/4 → 1/4` 实时同步；AC-5 三种关闭全部生效且列表状态不丢；AC-6 `role="dialog"`/`aria-modal`/aria-label 实测通过、可点区域为真实 `<button>`、无硬编码中文；AC-9 `git status` 核实改动仅 `apps/web` + 文档/task。验收残留（1 笔 ACTIVE 租赁 + 库存 -1）已在事务内清理还原并刷新复核。

**脊柱同步**：`ARCHITECTURE.md` §8 决策行（模态框载体 + 列表数据零请求派生 + 借阅同源 + 触发区结构 + `borrowLabel` 抽位）与 §9 `components/library/` 映射、`PROJECT_STATUS.md` 五节、`docs/requirements/README.md` 索引 → implemented。

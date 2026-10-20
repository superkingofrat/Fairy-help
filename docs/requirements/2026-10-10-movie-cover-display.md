# 影片库影片卡片封面展示

- 状态：implemented（2026-10-10 实现 + 单测 + 真机验收通过；Trellis task `10-10-movie-cover-display`；未提交、未开 PR，见文末「实现与验收记录」）
- 日期：2026-10-10
- 负责人：Flores
- 前置：FU-9 影片库浏览页已交付（`MovieLibraryPage` + `MovieCard`）；`coverUrl` 早已在 `Movie` DTO 与 `API_CONTRACT.md` 中（无需契约变更）；39 张绝区零影片海报已收集于 `packages/database/prisma/seedData/covers/`（本会话产出，待负责人导入）

## 背景 / 问题

负责人要求在影片库的影片区域为每部影片增加封面展示（见截图红框区域）。

代码事实：封面数据链路早已存在，缺的只有前端渲染——

- `packages/shared/src/types/movieTypes.ts:18`：`Movie.coverUrl: string | null` 已在共享 DTO 中；
- `API_CONTRACT.md:39`（Movie 类型）与 §3.1/§3.2（搜索/列表响应示例）均已包含 `coverUrl`；`apps/api/src/services/movieService.ts:68` 已在响应中下发该字段；
- `apps/web/src/components/library/MovieCard.tsx` 当前只渲染标题、年份·导演、心情、场景、库存与借阅按钮，**完全不消费 `coverUrl`**。

即：本需求是**纯前端展示功能**，无公共契约变更、无 schema 迁移、零后端改动，按 AGENTS §15.1 走 **Trellis 轨**（单 app：`apps/web`）。

素材现状（本会话已收集，随本需求一并落地）：

- `packages/database/prisma/seedData/covers/`：39 张海报 PNG（182×292，共约 4.6 MB），文件名即游戏内片名；
- `packages/database/prisma/seedData/zzzMovies.ts`：39 条影片数据，`coverUrl` 当前为相对路径 `"covers/<片名>.png"`——**该形态在 SPA 下不可用**（Vite 不会 serve seedData 目录，相对路径还会随当前路由解析错位），需随本需求改为 `/covers/<片名>.png` 并配套落地目录。

## 目标

1. 影片库影片卡片在 `coverUrl` 非空时渲染封面图，图源为本地静态资源，dev 与生产（nginx）均可直接访问。
2. `coverUrl` 为空的影片（现存 6 部真实电影）有得体的占位表现，网格内卡片高度一致、不错位。
3. 封面加载失败时降级为占位，不向用户显示破图（符合 §0 用户体验保障）。
4. 卡片既有信息与借阅交互零回归；`API_CONTRACT.md`、`packages/shared`、`apps/api`、`packages/database` 零改动。

## 范围

- **封面资产落地（apps/web）**：
  - 新建 `apps/web/public/covers/`（该目录当前不存在），将 `packages/database/prisma/seedData/covers/` 的 39 张 PNG 复制入内，文件名保持不变（含中文与全角字符，如 `邦布知道！.png`）。
  - `zzzMovies.ts` 的 39 条 `coverUrl` 由 `covers/<片名>.png` 改为 `/covers/<片名>.png`（seed 数据文件，未接入 `seed.ts`，非产品代码；改后负责人导入即生效）。
- **卡片渲染（apps/web）**：
  - `MovieCard.tsx`：`coverUrl` 非空 → 封面 `<img>` 置顶（`loading="lazy"`、`alt` 含片名、`object-cover` 锁定竖版比例）；为空或 `onError` 触发 → CSS 占位块（渐变底 + 片名首字，`aria-hidden` 装饰性）。既有文字信息与借阅按钮布局随封面微调，交互不变。
  - i18n：新增封面相关键（如 `library.cover.alt` = `《{title}》封面`），全部走 `apps/web/src/locales/zh-CN.json` 唯一来源。
- **测试（apps/web）**：
  - 新建 `MovieCard.test.tsx`：有封面渲染 `img`（断言 src/alt）、无封面渲染占位且无 `img`、`onError` 降级为占位。
  - `MovieLibraryPage.test.tsx` 补例：列表含 `coverUrl` 影片时页面渲染封面；既有用例（fixture `coverUrl: null`）不回归。
- **验证**：`pnpm --filter=@fairy/web test`、`pnpm --filter=@fairy/web typecheck`、`pnpm lint`、`pnpm format:check`。
- **文档**：`ARCHITECTURE.md` §8 决策行（封面落地方式与降级约定）与 §9 模块映射；`PROJECT_STATUS.md` 在交付后更新（Completed Modules + 需求索引）；`docs/requirements/README.md` 索引登记。`API_CONTRACT.md` **不变**。

## 非目标

- 不改 `API_CONTRACT.md`、`packages/shared`、`apps/api`、`packages/database`（`coverUrl` 已在契约与 DTO 中，无需任何变更）。
- 不做聊天页推荐卡（`RecommendationCard`）与管理端影片列表（`MoviesAdminPage`）的封面展示——如需另立需求。
- 不做封面上传/裁剪/图库管理（管理端表单已有「封面链接」文本框，本次不扩展）。
- 不为现存 6 部真实电影收集/绘制封面（保持 `coverUrl: null` 走占位）。
- 不做 CDN/图床迁移与图片压缩转 WebP（部署确有需要时另立需求）。
- 不改影片库的筛选/分页/搜索逻辑与卡片网格列数。

## 受影响模块

- `apps/web/src/components/library/MovieCard.tsx`（封面渲染 + 占位 + onError 降级）
- `apps/web/src/components/library/MovieCard.test.tsx`（新建）、`apps/web/src/components/library/MovieLibraryPage.test.tsx`（补例）
- `apps/web/public/covers/`（新建，39 张 PNG）
- `apps/web/src/locales/zh-CN.json`（封面 i18n 键）
- `packages/database/prisma/seedData/zzzMovies.ts`（`coverUrl` 形态修正，数据文件）
- 文档：`ARCHITECTURE.md`、`PROJECT_STATUS.md`、`docs/requirements/README.md`
- **不涉及**：`packages/shared`、`apps/api`、`packages/database`（schema/迁移/seed.ts 本体）

## 验收标准

- AC-1：`coverUrl` 非空的影片卡片渲染 `<img>`，`src` 等于该影片 `coverUrl`，`alt` 含片名；`apps/web/public/covers/` 下 39 个文件与 `zzzMovies.ts` 引用一一对应（无缺失、无多余）。
- AC-2：`coverUrl` 为 `null` 的影片卡片不渲染 `<img>`，渲染 CSS 占位（含片名首字），占位高度与真实封面一致，三列网格内不错位。
- AC-3：封面加载失败（`onError`，如资源 404）时降级为占位，不显示破图、不抛未捕获错误。
- AC-4：卡片既有信息（标题/年份·导演/心情/场景/库存）与借阅按钮行为零回归——既有 `MovieLibraryPage.test.tsx` 与全量 web 测试全绿佐证。
- AC-5：封面 i18n 键齐全、无未翻译 key 上屏；`img` 有非空 `alt`，占位 `aria-hidden`（可访问性）。
- AC-6：`pnpm --filter=@fairy/web test` 全绿 + `pnpm --filter=@fairy/web typecheck` + `pnpm lint` + `pnpm format:check` 通过。
- AC-7：真机（§15.4 双 dev server，`user@fairy.local`）：导入 `zzzMovies` 后影片库 39 部影片封面全部渲染；无封面老影片显示占位；翻页/筛选/搜索后布局稳定无抖动。（2026-10-11 闭环；老影片实际为 8 部 = 6 部 seed 基线 + `海蒂和爷爷`/`123` 两个历史验收残留，见文末实现与验收记录）
- AC-8：`coverUrl` 均为前导斜杠形态（`/covers/...`），SPA 在任意路由下均可正确解析资源。

## 待决问题（2026-10-10 已定稿，见上方决策记录）

1. **封面存放与 URL 形态**：复制到 `apps/web/public/covers/`，`coverUrl` 存 `/covers/<片名>.png`（已采纳）。Vite dev 直接可用、生产 nginx 直接 serve、零后端改动；代价是约 4.6 MB 图片进入 web 构建产物。备选（未采纳）：API 静态托管（从 prisma 目录 serve，不规范）；暂不落地资产（只改渲染逻辑）。
2. **无封面影片占位**：纯 CSS 占位块（渐变底 + 片名首字，高度与封面一致）（已采纳），符合项目「纯 CSS 不引图表库」既有风格。备选（未采纳）：不渲染封面区（卡片更矮、网格不齐）；统一默认封面图（需额外产出素材）。
3. **展示范围**：仅影片库卡片 `MovieCard`（推荐，范围最小、验收聚焦）。备选：含聊天推荐卡；含管理端影片列表。
4. **卡片布局**：封面置顶（竖版海报 182:292，`object-cover` 裁切），文字信息与按钮在下；现有三列网格与分页不变。（实现细节，如需侧图布局请在批准时指出）

## 决策记录（2026-10-10 批准时定稿）

1. **封面存放与 URL 形态**：39 张 PNG 复制到 `apps/web/public/covers/`（文件名保持游戏原名），`zzzMovies.ts` 的 `coverUrl` 由 `covers/<片名>.png` 改为 `/covers/<片名>.png`（前导斜杠，SPA 任意路由可解析；Vite dev 与生产 nginx 均可直接 serve，零后端改动）。
2. **无封面影片占位**：纯 CSS 占位块——渐变底 + 片名首字、`aria-hidden`、高度与真实封面一致（卡片不错位）；封面 `onError`（如 404）同样降级为该占位（§0 用户体验保障，不显示破图）。
3. **展示范围**：仅影片库 `MovieCard`（聊天推荐卡 `RecommendationCard`、管理端影片列表为非目标）。
4. **卡片布局**：封面置顶（竖版海报 182:292，`object-cover` 裁切 + `loading="lazy"`），文字信息与借阅按钮在下；三列网格与分页不变。
5. **轨道**：**Trellis 轨**（单 app `apps/web`、无公共契约变更、无 schema 变更）——Trellis task → `task.py start` → 实现 → 真机验收。

## 实现与验收记录（2026-10-10 实现，2026-10-11 数据导入后 AC-7 闭环）

**实现**

- `apps/web/public/covers/`：39 张绝区零海报 PNG（182×292，约 4.6 MB，文件名即游戏内片名，含中文与全角字符）从 `packages/database/prisma/seedData/covers/` 复制而来；与 `zzzMovies.ts` 的 39 条 `coverUrl` 引用经 node 脚本交叉核验一一对应（无缺失、无多余，AC-1 后半）。
- `packages/database/prisma/seedData/zzzMovies.ts`：`coverUrl` 由 `covers/<片名>.png` 统一改为 `/covers/<片名>.png`（AC-8）。原相对路径形态在 SPA 下会随当前路由解析错位，属素材落地必须一并修正的数据缺陷。
- `apps/web/src/components/library/MovieCard.tsx`：`useState` 跟踪 `coverFailed`；`coverUrl` 非空且未失败时渲染 `<img src loading="lazy" onError>`（`h-44 w-full object-cover rounded`，置顶），alt 取 `t("library.cover.alt").replace("{title}", movie.title)`；为空或 onError 时渲染 `<div aria-hidden="true">` 占位（渐变底 + 片名首字，等高 `h-44`）。卡片既有信息与借阅交互零改动（AC-1~AC-3、AC-5）。
- `apps/web/src/locales/zh-CN.json`：新增 `library.cover.alt` = `《{title}》封面`（i18n 无插值，调用方 `.replace()`，与仓库既有约定一致）。
- `ARCHITECTURE.md`：§8 新增决策行（静态托管 + 前导斜杠理由 + img/占位/onError 降级 + 零契约/零 schema/零后端），§9 `components/` 树补 `library/` 行。
- `packages/database/prisma/seed.ts`（2026-10-11 数据导入）：import `zzzMovies`，影片循环由 `for (const movie of seedMovies)` 改为 `[...seedMovies, ...zzzMovies]`——按 `title` 唯一索引 upsert（`update` 刷新全字段、`create` 原样落库），幂等；沿用模块加载即生效的 `NODE_ENV=production` 拒绝守卫。现实片单与绝区零片单同库共存（后者带封面，前者留作无封面占位对照）。无 schema 变更、无迁移、无 API/契约变更。

**验证**

- `pnpm --filter=@fairy/web test`：**157 全绿**（新建 `MovieCard.test.tsx` 4 例：封面 img 渲染 src/alt、null coverUrl 出占位不出 img、`fireEvent.error` 降级为占位、借阅点击透传 `onBorrow(movie.id)`；`MovieLibraryPage.test.tsx` 补 1 例：有封面影片经 API 数据渲染 img）。
- `pnpm --filter=@fairy/web typecheck`、`pnpm lint`、`pnpm --filter=@fairy/database typecheck`：全过。
- `pnpm format:check`：全仓 171 个既有文件报 CRLF——系 `core.autocrlf=true` 检出工作区 CRLF 与 prettier 默认 `endOfLine: "lf"` 的**环境性既有现象**（master 上同样失败，未改动的 `MovieLibraryPage.tsx`/`README.md`/`turbo.json` 同样上榜；`git show HEAD:` 的 LF 副本则通过）。本次改动内容经 prettier 逐字核对干净，未对跟踪文件批量改行尾（否则产生整文件 diff）。**AC-6 的 `format:check` 项按此口径记录为既有环境状况，非本次引入。**

**真机验收**（§15.4 双 dev server + Neon dev 库 + `user@fairy.local`，浏览器 DOM 断言）

- AC-1/AC-3（img 成功路径）：《千与千寻》封面 `naturalWidth` 182 / `naturalHeight` 292，加载完成；alt 为「《千与千寻》封面」。
- AC-3（onError 降级路径）：临时将某部影片 `coverUrl` 置为 `"123"` → 该卡片降级为占位（首字「1」），无破图、无未捕获错误；验收后已还原为 `null`。
- AC-2（null 占位路径）：6 部 `coverUrl` 为 null 的老影片均渲染占位（含片名首字）。
- AC-2（网格对齐）：数值核验全部卡片等高 385px、封面区统一 176px；翻页/筛选/搜索后布局稳定无抖动。
- AC-7（**2026-10-11 数据导入后闭环**）：`zzzMovies.ts` 已并入 `seed.ts` 影片循环（`[...seedMovies, ...zzzMovies]`，按 `title` upsert，幂等），`db:seed` 后 dev 库 47 部 = 39 部绝区零 + 8 部原有。真机 `/movies` 四页 12/12/12/11 张卡片共 47 部（无重复标题），**39 张封面 `naturalWidth>0` 全部加载成功、0 破图**；8 部无封面老影片渲染 CSS 占位；第 4 页封面与占位混排下全部卡片等高 385px、媒体区统一 176px，三列网格无错位。另核验：`GET /api/movies` total=47 且 39 条 `coverUrl` 均为 `/covers/...` 前导斜杠形态（0 条异常）；39 个 PNG 经 web dev server 逐一 HTTP 200（content-type image）核验可解析；复跑 `db:seed` 零增长（47/39/8、users 51/profiles 49/memories 159/rentals 10 两次一致）。

**过程中复现的两个环境陷阱**（均非产品缺陷，记入 `PROJECT_STATUS.md` Last Updated）

- Neon 冷启动：页面 reload 后首次 `/api/movies` 偶发超过 Prisma 默认 5s 超时（列表停在「加载中...」），等待约 6s 后恢复——与 Risks 已登记现象一致，连接串已带 `connect_timeout=15&pool_timeout=15`。
- Git Bash 下 curl 直传含中文的 JSON body 会产生乱码（U+FFFD）：验收时因此把 `coverUrl` 写入过乱码值，改用 node 写 UTF-8 文件 + `curl --data-binary @file` 后正确——与 2026-09-23 FU-19 验收同一陷阱。

**待负责人（非开发项）**：dev 库两个历史验收残留影片 `123`（`director="123"`、`year=2000`、`stock=0/1`，其 `coverUrl` 上次声称还原实际仍为 `"123"`，本次已置回 `null`）与 `海蒂和爷爷`（与 `海蒂` 题材重复）各带 1 笔租赁记录，删除影片属破坏性操作且牵涉租赁历史，未自行处置——已登记 `PROJECT_STATUS.md` In Progress 待负责人决定保留或删除。本需求未提交、未推送、未开 PR。

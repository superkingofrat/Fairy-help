# 实现计划 — 影片库影片卡片封面展示

## 执行顺序

1. **封面资产落地**
   - 新建 `apps/web/public/covers/`，把 `packages/database/prisma/seedData/covers/` 下 39 个 PNG 原样复制（文件名不变，含中文与全角字符）。
   - 改 `packages/database/prisma/seedData/zzzMovies.ts`：39 条 `coverUrl` 由 `covers/<片名>.png` → `/covers/<片名>.png`（只改前缀，其他字段不动）。
   - 自检：`grep -c 'coverUrl: "/covers/' zzzMovies.ts` = 39；`ls apps/web/public/covers | wc -l` = 39；引用名与文件名一一对应。

2. **i18n 键**（`apps/web/src/locales/zh-CN.json`，`library` 节内）
   - `library.cover.alt` = `《{title}》封面`（占位符替换用现有 `t` 的替换约定，参考 `library.page.info` 的 `.replace()` 写法或 i18n 支持的插值方式，按 `lib/i18n.ts` 现状定）。

3. **`MovieCard.tsx` 渲染**
   - 新增本地状态 `coverFailed`（`onError` 置 true）。
   - 渲染分支：`movie.coverUrl && !coverFailed` → `<img src={movie.coverUrl} alt={t("library.cover.alt").replace("{title}", movie.title)} loading="lazy" className="mb-3 h-44 w-full rounded object-cover" onError={() => setCoverFailed(true)} />`；否则 → 占位块 `<div aria-hidden="true" className="mb-3 flex h-44 w-full items-center justify-center rounded bg-gradient-to-br from-slate-200 to-slate-300 text-2xl font-semibold text-slate-500">{movie.title.slice(0, 1)}</div>`。
   - 高度与真实封面一致（同一 `h-44`），卡片其余结构不动。
   - 注意：`alt` 文案含片名；占位 `aria-hidden`；不加 `role="img"`。

4. **测试**
   - 新建 `apps/web/src/components/library/MovieCard.test.tsx`：
     - 有封面 → `screen.getByRole("img")`，断言 `src` 与 `alt`；
     - 无封面（coverUrl null）→ `queryByRole("img")` 为 null，占位首字在文档中；
     - `fireEvent.error(img)` → 降级为占位（img 消失、占位出现）。
   - `MovieLibraryPage.test.tsx` 补一例：fixture 改 `coverUrl: "/covers/测试.png"`（或在既有用例上加断言 `getByRole("img")` 存在），不破坏既有 7 例。
   - 测试文件放源文件旁（`*.test.tsx`，AGENTS §7）。

5. **验证**（改动范围：仅 web 包 + seedData 数据文件）
   - `pnpm --filter=@fairy/web test`
   - `pnpm --filter=@fairy/web typecheck`
   - `pnpm lint`
   - `pnpm format:check`
   - `packages/database` 无代码改动，仅数据文件字符串，不需要 migrate/generate；仍跑 `pnpm --filter=@fairy/database typecheck` 兜底（若该包有 typecheck 脚本）。

6. **文档**
   - `ARCHITECTURE.md`：§8 决策行新增一条（封面落地 `apps/web/public/covers/` + `coverUrl` 前导斜杠 + CSS 占位降级）；§9 模块映射补 `MovieCard` 封面职责（若该节列了组件）。
   - `PROJECT_STATUS.md`：实现完成后写入 Completed Modules 顶部 + In Progress 移除本条 + Next Steps 视情况。
   - 需求文档状态 → implemented（交付后）。

7. **真机验收**（AC-7）
   - 双 dev server（§15.4）；`user@fairy.local` 登录进影片库。
   - 管理端临时给一部影片填 `/covers/<某片名>.png`（需库里有对应文件——注意库内 6 部老电影没有对应封面文件，可在管理端把某片的 coverUrl 设为 `/covers/星徽骑士.png` 之类的真实文件验证渲染），验收后还原为 null。
   - 断言：封面 img 渲染（network 200）、其余 5 部显示占位首字、翻页/筛选/搜索后布局稳定、控制台无未捕获错误。

## Rollback

- 全部改动为增量（新目录 + 组件内新增分支 + 数据文件字符串），无迁移无契约；如需回滚：`git checkout -- apps/web packages/database/prisma/seedData/zzzMovies.ts && rm -rf apps/web/public/covers`。

## 评审门禁

- 实现完成后先自跑第 5 步验证，再进真机验收；真机不过则回到第 3/4 步修。

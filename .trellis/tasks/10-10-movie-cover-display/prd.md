# 影片库影片卡片封面展示

来源需求：[docs/requirements/2026-10-10-movie-cover-display.md](../../../docs/requirements/2026-10-10-movie-cover-display.md)（2026-10-10 负责人批准，Status: approved）。

## Goal

影片库影片区域（`MovieLibraryPage` 网格内的 `MovieCard`）展示影片封面：`coverUrl` 非空时渲染封面图，为空或加载失败时降级为纯 CSS 占位块；既有信息与借阅交互零回归。无 API 契约变更、无 schema 迁移、零后端改动。

## Requirements

- 封面资产落地：`packages/database/prisma/seedData/covers/` 的 39 张 PNG 复制到 `apps/web/public/covers/`（文件名保持游戏原名不变）；`zzzMovies.ts` 的 `coverUrl` 由 `covers/<片名>.png` 改为 `/covers/<片名>.png`（前导斜杠，SPA 任意路由可解析）。
- `MovieCard.tsx` 渲染封面：`coverUrl` 非空 → 封面 `<img>` 置顶（`loading="lazy"`、`object-cover` 锁定 182:292 竖版比例、`alt` 含片名）；为空或 `onError` → CSS 占位块（渐变底 + 片名首字，`aria-hidden`，高度与真实封面一致）。
- i18n：封面 alt 文案走 `apps/web/src/locales/zh-CN.json`（如 `library.cover.alt`），不硬编码中文字符串。
- 测试：新建 `MovieCard.test.tsx`（有封面渲染 img 断言 src/alt、无封面渲染占位且无 img、onError 降级为占位）；`MovieLibraryPage.test.tsx` 补一例（列表含 coverUrl 影片时页面渲染封面）。
- 文档：`ARCHITECTURE.md` §8 决策行 + §9 映射、`PROJECT_STATUS.md`（交付后）、需求索引；`API_CONTRACT.md` 不变。

## Constraints

- AGENTS §15.1 Trellis 轨（单 app `apps/web`，无公共契约变更）；§4 前端约定（函数式组件、i18n 唯一来源、显式处理加载/错误/空态）；§0 用户体验保障（不得向用户暴露破图/原始错误）。
- 复用现有模式：卡片用 Tailwind 类 + 项目既有纯 CSS 风格（不引图表库/图片库）；测试沿用 `vi.mock` + testing-library 既有写法。
- 不引入新依赖。

## Acceptance Criteria

- [ ] AC-1：`coverUrl` 非空的卡片渲染 `<img>`，`src` 等于该影片 `coverUrl`，`alt` 含片名；`apps/web/public/covers/` 39 个文件与 `zzzMovies.ts` 引用一一对应。
- [ ] AC-2：`coverUrl` 为 `null` 的卡片不渲染 `<img>`，渲染 CSS 占位（含片名首字），高度与真实封面一致，网格不错位。
- [ ] AC-3：`onError`（如 404）降级为占位，不显示破图、不抛未捕获错误。
- [ ] AC-4：既有信息（标题/年份·导演/心情/场景/库存）与借阅按钮行为零回归，既有 `MovieLibraryPage.test.tsx` 与全量 web 测试全绿。
- [ ] AC-5：i18n 键齐全、无未翻译 key 上屏；`img` 有非空 `alt`，占位 `aria-hidden`。
- [ ] AC-6：`pnpm --filter=@fairy/web test` 全绿 + `pnpm --filter=@fairy/web typecheck` + `pnpm lint` + `pnpm format:check` 通过。
- [ ] AC-7：真机（§15.4 双 dev server，`user@fairy.local`）：影片库既有 6 部影片封面/占位按 `coverUrl` 正确呈现，翻页/筛选/搜索后布局稳定。
- [ ] AC-8：`zzzMovies.ts` 的 `coverUrl` 均为 `/covers/...` 前导斜杠形态。

## Notes

- `zzzMovies.ts` 未接入 `seed.ts`，本次只改数据文件的 `coverUrl` 形态；39 部影片入库由负责人另行执行（"晚点我导进去"）。真机验收用库内现有影片即可覆盖 AC-1/2/3（管理端可临时给某部影片填 `/covers/<片名>.png` 验证）。
- 现存 6 部 seed 电影 `coverUrl` 均为 null → 走占位路径，正好覆盖 AC-2/AC-4。

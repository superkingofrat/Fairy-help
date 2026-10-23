# 真机验收记录：影片库影片详情查看

- 日期：2026-10-11 · 环境：api :3000 + web :5173 双 dev server，Neon 开发库，登录账号 `user@fairy.local`
- 方式：浏览器 DOM / ARIA / `naturalWidth` 断言（IAB 自动化），未做美术走查
- 对应需求：[docs/requirements/2026-10-11-movie-detail.md](../../../docs/requirements/2026-10-11-movie-detail.md)（2026-10-11 负责人批准）

## 结果

| 断言                                                  | 结果 | 证据                                                                                                                     |
| ----------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| AC-1 卡片可点区域点击打开详情                          | ✅   | 12 张卡片均有 `button[name="查看《片名》详情"]`；点击《第一杯土》后 `dialog[name="影片详情"]` 出现（count 1）                 |
| AC-2 详情展示全部字段                                  | ✅   | 《第一杯土》对话框文本：片名 / `2252 · 旧文明档案馆` / `类型: 纪实 / 传记` / `心情: 致郁 / 治愈` / `场景: 周末午后 / 独自在家` / `库存: 2 / 4` / `台词: 「梅弗劳尔家族…」` / `简介: …` |
| AC-2 老片（无封面）字段渲染                            | ✅   | 第 4 页《盗梦空间》对话框：`2010 · Christopher Nolan`、`类型: 科幻 / 动作`、`库存: 3 / 5`、台词与简介齐全                     |
| AC-3 封面 img 成功路径                                 | ✅   | 《第一杯土》详情封面 `src="/covers/第一杯土.png"`、`naturalWidth` 182 / `naturalHeight` 292                                  |
| AC-3 coverUrl 为 null 走占位                           | ✅   | 《盗梦空间》详情内 `img` 数量 0；占位 `div[aria-hidden="true"]` 文本为片名首字「盗」                                          |
| AC-4 详情内借阅与卡片状态同源                          | ✅   | 详情内点「借阅」→ 页面提示「借阅成功」；`已借` 按钮共 2 个（卡片 1 + 详情 1）且均 `disabled=true`；详情库存由 `2 / 4` 实时变 `1 / 4`（卡片库存同步变 1） |
| AC-5 关闭方式一：关闭按钮                              | ✅   | 点「关闭」→ dialog count 1→0                                                                                              |
| AC-5 关闭方式二：遮罩点击                              | ✅   | 点击遮罩（overlay 原生 click）→ dialog count 1→0；面板内点击不关闭（单测覆盖，见 AC-7）                                       |
| AC-5 关闭方式三：Esc                                   | ✅   | window keydown Escape → dialog count 1→0                                                                                  |
| AC-5 关闭后列表状态不丢                                | ✅   | 三次开关后卡片触发按钮仍 12 个、页码「第 1 / 4 页」；翻到第 4 页再翻回，首页第一张卡 `库存: 2`、借阅按钮恢复「借阅」            |
| AC-6 可访问性与 i18n                                    | ✅   | 对话框 `role="dialog"` + `aria-modal="true"` + `aria-label="影片详情"`；卡片触发区为真实 `<button>`（aria-label 含片名）；界面无硬编码中文（全部 `library.detail.*` / 复用键） |
| AC-9 零后端 / 零契约 / 零 schema                       | ✅   | `git status`：本功能改动仅 `apps/web/src/components/library/*`、`apps/web/src/locales/zh-CN.json` 与文档 / task（`apps/api`、`packages`、`API_CONTRACT.md` 的未提交改动属此前 FU-20 与封面功能） |

## 验证命令

- `pnpm --filter=@fairy/web test`：**171 全绿**（新建 `MovieDetailModal.test.tsx` 10 例 + `MovieCard.test.tsx` 补 2 例 + `MovieLibraryPage.test.tsx` 补 2 例；既有用例零回归）
- `pnpm --filter=@fairy/web typecheck`：通过
- `pnpm lint`：8/8 通过（曾因 `borrowLabel` 从 `MovieCard.tsx` 导出触发 `react-refresh/only-export-components` 警告，`--max-warnings 0` 下失败；按仓库既有先例 `components/fairy/expressions.ts` 拆出独立 `borrowLabel.ts` 后通过）
- `pnpm format:check`：按封面需求既有口径——全仓 169 个既有文件报 CRLF（`core.autocrlf=true` 检出 vs prettier `endOfLine: "lf"`，master 同样失败）；本次 8 个改动文件经 prettier 逐字核对干净（含修掉两处 prettier 格式差异），3 个新文件直接通过，未对跟踪文件批量改行尾

## 未在真机覆盖的部分（含原因）

- **quote 为 null 不渲染该行**：dev 库 46 部影片 `quote` 均非 null（seed 数据无空台词），真机无可触发样本；由 `MovieDetailModal.test.tsx` 单测覆盖（`movie.quote = null` 时对话框文本不含「台词」）。
- **遮罩点击的坐标精度**：IAB 后端无 `mouse` / `dispatchEvent` API，遮罩点击以 overlay 元素原生 `click()` 触发（事件冒泡至 React 委派监听，与真实点击同路径）；「面板内点击不关闭」由单测覆盖。
- **AC-8 format:check**：见上，既有环境现象。

## 验收残留清理

真机借阅《第一杯土》产生 1 笔 ACTIVE 租赁（`user@fairy.local`，创建于验收当时）并使库存 2→1。已在事务内还原：删除该租赁 + 库存回补 1（`stockBefore: 1 → stockAfter: 2`，`activeRentalsAfter: 0`），并经页面刷新复核（首页第一张卡 `库存: 2`、按钮「借阅」）。历史 RETURNED 租赁未触碰。

## 备注

- **详情数据零请求**：整个验收过程未产生任何新增 `/api/movies/:id` 请求——详情完全由列表响应中已有的完整 `Movie` 对象渲染（`detailMovieId` + 从当前 `movies` 派生），借阅后库存实时更新即该设计的直接证据。
- **`borrowLabel` 抽位**：借阅按钮文案在卡片与详情两处消费，抽为 `components/library/borrowLabel.ts` 纯函数（i18n 键不变），避免重复三元判断；`CardStatus` 类型仍留在 `MovieCard.tsx`（类型-only 反向 import，运行时无循环）。
- **卡片触发区结构**：封面 + 文字信息区包在一个 `<button type="button">` 内（借阅按钮为其兄弟节点而非子节点），因此「点借阅不打开详情」由结构保证、无需 `stopPropagation`；`onOpenDetail` 未传时（如潜在复用方）渲染 `<div>` 包裹，行为与改动前一致。
- Neon 冷启动、Git Bash curl 非 UTF-8 body 两个已知环境陷阱本次未再触发（页面 8s 内完成加载）。

## Phase 3.3 spec 更新判断（2026-10-11）

结论：**`.trellis/spec/` 无需更新**。逐项判断：

1. **详情载体选型（模态框 / 零请求 / 从列表派生）/ 三种关闭 / 详情内借阅同源** → 已写入 `ARCHITECTURE.md` §8 决策行与 §9 `components/library/` 映射（架构决策归属地，与封面需求同行）。
2. **`react-refresh/only-export-components` 与 `--max-warnings 0` 的冲突及拆文件解法** → 属工程约定踩坑，`components/fairy/expressions.ts` 已有同类先例；已记入本 acceptance 与需求文档实现记录，随 `/trellis:finish-work` 进 Trellis journal。
3. **`.trellis/spec/` 仍是未填模板**（同封面任务判断）：项目真实约定沉淀在 `AGENTS.md` / `ARCHITECTURE.md`（§15.3 允许），填充模板属独立文档工作，不顺手制造漂移。

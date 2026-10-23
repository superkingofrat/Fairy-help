# 真机验收记录：影片库影片卡片封面展示

- 日期：2026-10-10（实现验收）/ 2026-10-11（数据导入后 AC-7 闭环） · 环境：api :3000 + web :5173 双 dev server，Neon 开发库，登录账号 `user@fairy.local`
- 方式：浏览器 DOM / `naturalWidth` / `boundingBox` 断言（IAB 自动化），未做美术走查
- 对应需求：[docs/requirements/2026-10-10-movie-cover-display.md](../../../docs/requirements/2026-10-10-movie-cover-display.md)

## 结果

| 断言                                                  | 结果 | 证据                                                                                                                    |
| ----------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| AC-1 封面 img 成功路径（src + alt + 真实解码尺寸）     | ✅   | 《千与千寻》：`naturalWidth` 182 / `naturalHeight` 292，`alt="《千与千寻》封面"`，`src="/covers/千与千寻.png"`            |
| AC-1 封面文件与数据引用一一对应                        | ✅   | node 脚本交叉核验：`zzzMovies.ts` 39 条 `/covers/...` 引用 ↔ `apps/web/public/covers/` 39 个文件，无缺失、无多余          |
| AC-2 null coverUrl 渲染 CSS 占位（不出 img）           | ✅   | 6 部老影片 `coverUrl` 为 null → 卡片渲染 `div[aria-hidden="true"]` 占位（片名首字），`img` 数量 0                         |
| AC-2 占位与封面等高、三列网格不错位                    | ✅   | 全部卡片 `boundingBox` 等高 385px；封面区/占位区统一 176px                                                               |
| AC-3 onError 降级（不显示破图、无未捕获错误）           | ✅   | 临时把某片 `coverUrl` 置 `"123"` → 该卡片降级为占位（首字「1」）；无破图、无未捕获错误；验收后已还原为 `null`             |
| AC-4 既有卡片信息与借阅交互零回归                      | ✅   | web 包 157 测试全绿（含既有 `MovieLibraryPage` 8 例）；真机借阅按钮「已借」置灰行为不变                                    |
| AC-5 i18n 键与非空 alt、占位 aria-hidden                | ✅   | `library.cover.alt` = `《{title}》封面`；img alt 非空；占位 `aria-hidden="true"`                                          |
| AC-8 coverUrl 前导斜杠形态                             | ✅   | 39 条引用均为 `/covers/<片名>.png`（数据文件静态核验 + 真机 `src` 实测）                                                  |
| 翻页 / 筛选 / 搜索后布局稳定                           | ✅   | 翻页与 mood 筛选、keyword 搜索后卡片等高与封面区高度不变，无抖动                                                        |

## 2026-10-11 数据导入后追加（AC-7 闭环）

负责人「把刚刚这些新的影片导入数据库吧」。`seed.ts` 影片循环改为 `[...seedMovies, ...zzzMovies]`（按 `title` upsert，幂等，沿用生产拒绝守卫），`db:seed` 后 dev 库 47 部 = 39 绝区零 + 8 原有。

| 断言                                        | 结果 | 证据                                                                                                     |
| ------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| AC-7 39 部封面全部渲染                      | ✅   | `/movies` 四页 12/12/12/11 共 47 部（无重复标题）；39 张封面 `naturalWidth>0` 加载成功、0 破图             |
| 8 部无封面老影片渲染占位                    | ✅   | 第 4 页 3 封面 + 8 占位；占位 `div[aria-hidden="true"]` 共 8 个                                          |
| 封面与占位混排下网格不错位                  | ✅   | 第 4 页全部卡片等高 385px、媒体区统一 176px                                                               |
| API 数据与 coverUrl 形态                    | ✅   | `GET /api/movies` total=47；39 条 `/covers/...` 前导斜杠，0 条异常形态                                     |
| 封面文件可解析                              | ✅   | 39 个 PNG 经 web dev server 逐一 HTTP 200（content-type image）                                            |
| 导入与数据文件零偏差                        | ✅   | 逐条比对 39 部 `coverUrl`/`stock`/`totalStock`：0 missing、0 mismatch                                       |
| 幂等                                        | ✅   | 复跑 `db:seed` 后 47/39/8、users 51/profiles 49/memories 159/rentals 10 与首跑一致，零增长                 |
| 验证命令                                    | ✅   | database typecheck + `pnpm lint` 8/8 + database 测试 6/6（含 seedGuard 2 例）                              |
| 残留还原                                    | ✅   | 影片 `123` 的 `coverUrl` 由未还原的 `"123"` 置回 `null`；该影片与 `海蒂和爷爷` 各带 1 笔租赁，删除待负责人 |

## 未在真机覆盖的部分（含原因）

- **AC-6 `format:check`**：全仓 171 个既有文件报 CRLF，系 `core.autocrlf=true` 检出工作区 CRLF 与 prettier 默认 `endOfLine: "lf"` 的环境性既有现象（master 上同样失败，未改动的文件同样上榜；`git show HEAD:` 的 LF 副本则通过）。本次改动内容经 prettier 逐字核对干净，未对跟踪文件批量改行尾。

## 备注

- **Neon 冷启动复现**：页面 reload 后首次 `/api/movies` 偶发超过 Prisma 默认 5s 超时（影片列表停在「加载中...」），等待约 6s 后恢复为 8 张卡片。与 `PROJECT_STATUS.md` Risks 已登记现象一致，连接串已带 `connect_timeout=15&pool_timeout=15`，非本次改动引入。
- **Git Bash 非 UTF-8 body 陷阱（第二次踩到）**：用 curl 直传含中文的 JSON body 会把 `coverUrl` 写成乱码（U+FFFD）；改用 node 写 UTF-8 文件 + `curl --data-binary @file` 后正确。与 2026-09-23 FU-19 验收同一陷阱，两次均记入 `PROJECT_STATUS.md` Last Updated。
- 封面图含中文与全角字符文件名，静态托管下浏览器与 Vite dev 均正常解析（真机验证）；若将来迁 CDN/对象存储需另行确认 URL 编码兼容（需求文档待决问题 1 已注明）。

## Phase 3.3 spec 更新判断（2026-10-10）

结论：**`.trellis/spec/` 无需更新**。逐项判断：

1. **静态资源托管方式 / 前导斜杠 / 占位降级** → 已写入 `ARCHITECTURE.md` §8 决策行与 §9 `components/library/` 映射（架构决策的正确归属地，§13.1 脊柱文档为唯一来源）。
2. **Git Bash curl 非 UTF-8 body 乱码** → 属验收方法踩坑（联调教训），已两次记入 `PROJECT_STATUS.md` Last Updated，按 §15.3 应随 `/trellis:finish-work` 进 Trellis journal，而非 spec 约定。
3. **`core.autocrlf=true` vs prettier `endOfLine: "lf"`** → 仓库既有环境现象，已在 `PROJECT_STATUS.md` 三次记录，非本次新增知识。
4. **i18n 无插值、调用方 `.replace("{key}", value)`** → 既有约定（沿用既有代码模式），非本次新发现。
5. `.trellis/spec/` 下 frontend/backend 各 guideline 文件至今仍是未填模板（"(To be filled by the team)"），本项目真实约定一直沉淀在 `AGENTS.md` / `ARCHITECTURE.md`（§15.3 允许 "`.trellis/spec/` 或本节 / §9"）。**把这些模板填上是独立的文档工作，不属于本任务范围**，不做顺手填充以免制造第二次漂移。

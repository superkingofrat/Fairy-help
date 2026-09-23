# 2026-09-23 旅行规划二期（FU-19）交付与归档会话记录

分支 `feature/travel-planning-phase-2`（基于 `chore/reliability-fixes`，即 master+35 提交的基础上，共 36 提交领先 master，**未推送**）。本会话 3 个提交：`756c52f`（feat shared+api）、`261ac00`（feat web）、`4c41058`（docs spine + openspec archive）。加上本分支早前的 `2a9da18`（需求文档 + OpenSpec 提案）共 4 个。OpenSpec 轨完整闭环：grill-me 收敛 → 需求 approved → 提案 approved → Apply → 真机验收 AC-1~7 → Archive。

## 流程与门禁

- 需求文档 `docs/requirements/2026-09-22-travel-planning-phase-2.md`（2026-09-22 grill-me 收敛，含 5 项待决问题）→ 用户对 5 项待决全部按推荐默认批准（「你推荐的可以，继续」）→ OpenSpec 提案 `openspec/changes/2026-09-22-travel-planning-phase-2/`（proposal/design/tasks + specs delta）→ 用户「批准」→ Apply。
- 属 §15.1 大变更（跨 shared/api/web + 公共 API 契约 + ARCHITECTURE 地图蓝图），未使用 P0/P1 豁免；chat SSE `trip` 契约形状一期定下二期不动，全程保持。

## 实现要点（相对提案的落地细节）

### shared（756c52f）

- `tripSchemas.ts` 新增 5 个 schema：`tripCreateRequestSchema`（destination 1–100 必填、days 可选 int 1–14、未知键剥除）、`tripListItemSchema`、`tripDetailSchema`（`tripResultSchema.extend({ createdAt })`）、`tripListQuerySchema`、`tripListFeedSchema`（items + pagination {page,limit,total,totalPages}）+ 类型导出；测试覆盖必缺/超长/days 越界、item 形状、detail 扩展、query 默认与剥键。

### api（756c52f）

- `services/tripService.ts`：`createTrip` 用 `composeMessage(destination, days)` 合成消息（`` `帮我规划${days ? ` ${days} 天的` : ""}${destination}行程` ``）后调用既有 `planTripTool`——LLM 草稿/高德校验/落库/TRIP_PLANNED 与 chat 内行程**同一链路**，无第二套生成实现；unresolved → 400 `TRIP_UNRESOLVED`，草稿失败 → 502 `TRIP_DRAFT_FAILED`。`listTrips` userId 限定 + createdAt desc + skip/take + count。`getOwnedTrip` 不存在或非本人非 admin 一律返回 null，controller 归一 404。
- `controllers/tripController.ts`：create 的 `role ∈ {admin, agent}` 门禁在**任何 LLM 调用之前**，非顾问 403 `TRIP_FORBIDDEN`；list 的 admin 代查分支（非 admin 403 `FORBIDDEN`、非法 uuid 400 `INVALID_USER_ID`、未知 404 `USER_NOT_FOUND`）；detail 404 同体防枚举。
- `routes/trips.ts` 挂 `/api/trips`；`__tests__/trips.test.ts` 覆盖 201 落库+日志、403 不调 tool、校验 400、unresolved/draft-failed 映射、分页信封、代查矩阵、详情 200/404。既有 chat/trip 用例保持绿（`authHeader("agent")` fixture 沿用批次 6）。

### web（261ac00）

- `components/chat/TripMap.tsx`：零 npm 依赖，运行时动态注入 Amap JS `v=2.0` script（key 从 `import.meta.env.VITE_AMAP_JS_KEY` 函数内读取——模块级读取会让 `vi.stubEnv` 失效）；`window.AMap` Promise 单例 + 失败缓存（不重试风暴）；Marker 仅 location 非空 POI；Polyline 仅在 route 非空时按 itinerary 有坐标 POI 顺序连线（route 段只有名称无坐标，点序只能从行程推导）；三重静默降级（无 key / 无坐标 / script 失败均 render null 不报错）；unmount 销毁 overlay。
- 测试手法：`vi.resetModules()` + 动态 `await import("./TripMap")` 做每例模块隔离；`vi.stubGlobal("AMap", fake)` 断言 Map/Marker/Polyline 调用参数；`vi.spyOn(document.head, "appendChild")` + `script.dispatchEvent(new Event("load"/"error"))` 驱动 script 生命周期。
- `components/trips/TripsPage.tsx`：列表（分页 + 加载/错误/空态）+ 详情（TripTimeline 含地图槽位）+ 创建表单（destination + days；非顾问角色隐藏表单给只读提示）；创建成功清表单、重置到第 1 页、刷新列表、提示「行程已创建，列表已刷新」。`lib/tripApi.ts` 复用 `lib/http`；`lib/errorMessages.ts` 加 TRIP_* 码表；App 路由 + 导航「行程」；i18n 全量。
- `apps/web/Dockerfile`：补 `ARG VITE_AMAP_JS_KEY=""` + `ENV VITE_AMAP_JS_KEY=$VITE_AMAP_JS_KEY`——**提案设计文档此处假设 build ARG 已支持，实际没有；不补这条生产镜像地图永不渲染**（本会话识别的真 production blocker，已在 tasks.md 收尾记录）。

## 真机验收（AC-1~AC-7 全过，双 dev server api:3000 + web:5173）

- AC-1：agent REST `POST /api/trips` 201（destination 杭州 days 2，Trip 行 + TRIP_PLANNED 日志落库 DB 断言）；普通 user 403 `TRIP_FORBIDDEN` 且该用户 TRIP_* 日志与 Trip 行数均为 0（门禁先于 LLM 无副作用）。
- AC-2：列表 createdAt desc + limit 分页；admin `?userId=` 200、非 admin 403 `FORBIDDEN`、非法 uuid 400 `INVALID_USER_ID`、未知 uuid 404 `USER_NOT_FOUND`。
- AC-3：本人详情 200；非本人与未知 tripId 同返 `{"code":"TRIP_NOT_FOUND","data":null}`，无存在性泄漏。
- AC-4/AC-5：TripMap 单测覆盖 Marker/Polyline（stub `window.AMap`）；本机无 `VITE_AMAP_JS_KEY`，E2E 实测地图区块静默不渲染、itinerary 文本完整。
- AC-6：单测 TripMap 7 + TripTimeline 集成 2 + TripsPage 9 + tripApi 5 + api trips 组。
- AC-7：浏览器 E2E（IAB）：agent 登录 → `/trips` 表单「北京 1 天」→ 列表置顶刷新 + 成功提示 + 详情时间线（未验证/未核实徽标 + 8 步骤）→ 地图不出现；退出后普通用户登录 → 只读提示 + 「还没有行程记录」空态、无创建表单。

### 验收期踩坑（测试方法，非产品缺陷）

1. **Git Bash curl 直传中文 body 变乱码**：`curl --data '{"destination":"杭州"}'` 在 Git Bash 下把中文打成非 UTF-8，LLM 收到 U+FFFD 替换字符、返回 `destination: null`，表现为 400 `TRIP_UNRESOLVED`（DB 日志 payload codepoint 5e2e 6211 … fffd fffd fffd fffd 坐实）。改用 `printf > file` + `--data-binary @file` 后全通。产品代码无需改动——顺带确认 `composeMessage` 产物「帮我规划 2 天的杭州行程」**确实命中** `DESTINATION_PATTERNS`（懒匹配 `[CJK]{2,6}?` 可吃「天的杭州」），design.md 的风险预案（controller 轻量比对）未触发。
2. **登录限流器烧穿**：login 10 次/15 分钟，反复验收登录触发 429；重启 api dev server 重置内存限流器即恢复（§9 允许的重启方式）。
3. **`pnpm --filter=@fairy/api exec tsx <script>` 偶发 "tsx not found"**：`--version` 能解析、跑脚本不能；绕法是直接 `node node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/cli.mjs <script>`（`.bin/tsx` 是 sh 脚本，node 不能直接当入口）。
4. **Prisma 枚举列不能用 `startsWith` 过滤**：`BehaviorAction` 是枚举，临时脚本里 `action: { startsWith: "TRIP_" }` 直接类型报错，改 `in: [...]` 枚举值。
5. IAB 多次 `tabs.new()` 会开出重复标签页导致 locator 歧义；Playwright click 对 disabled/重渲染按钮超时时，用页面内 `evaluate` DOM click 兜底（React 受控输入赋值要走 native setter + input 事件）。

## 验证

shared 107 / api 360（并发用例默认跳过 ×1）/ web 126 全绿 + 三包 typecheck + `pnpm lint` + prettier `format:check` + build。`pnpm ci` 在本机报 `ERR_PNPM_CI_NOT_IMPLEMENTED`（pnpm 版本不支持该命令），按 package.json 定义的 lint→typecheck→test→build 链手工等价执行全绿。`openspec validate --all` 13/13；`openspec archive 2026-09-22-travel-planning-phase-2 --yes` 完成，specs/travel-planning 合并 +3 ~1。

## 收尾

- 验收产物已清理：临时脚本 `apps/api/acceptance-tmp.ts` 删除；验收注册的 `ac-probe@fairy.local` 用户连同 refresh token 删除。dev 库中留存的 ~20 条验收行程为普通开发数据。
- 文档脊柱同步：API_CONTRACT §3.15/§4/§5（顺带移除已交付条目与过期 `GET /api/admin/insights` 记载）、ARCHITECTURE §3.1/§5.3/§8/§9、web `.env.example` + Dockerfile build ARG、`docs/deployment.md`、PROJECT_STATUS 五节、需求文档与 README 索引置 implemented。
- **未推送**：分支领先 master 36 提交，按惯例推送需负责人明确指示。线上地图渲染需负责人配置 `VITE_AMAP_JS_KEY`（referrer 白名单的 Web 端安全密钥）并重新构建 web 镜像后验证（AC-4 已由单测覆盖）。

---

## 同日追加：FU-16 真实 embed 验收尝试（结论：维持 owner-blocked，阻塞点精确化）

- **起因**：二期收尾后 `In Progress` 唯一剩余项。此前 Risks 只写「本环境无 OpenAI key」，本次精确核实：`Fairy/apps/api/.env` 中 `OPENAI_API_KEY=` 是**空占位行**，`EMBEDDING_API_KEY` 未配置 → `createEmbeddingProvider()` 返回 null（factory 在调用时读 env，`EMBEDDING_API_KEY` 缺省回退 `OPENAI_API_KEY`）。
- **写入链路实测**（双 dev server 下 user@fairy.local 发「我最近特别迷科幻片，太空题材的百看不厌，帮我记着」）：SSE `done` 正常、LLM 抽取记忆「用户特别迷科幻片，尤其喜欢太空题材，百看不厌」正常落库，但该画像 4 条记忆 `embedding` 全 NULL——即 AC-3「落库带向量」缺的只是 key；`addMemory` 落库后的 `refreshEmbeddingQuietly` 静默跳过，日志无警告，符合「无 key → null 降级信号」的契约。
- **降级证据**（AGENTS §0 用户体验保障）：直接调 `searchMemories`，两种查询均落到结构化路径（`findStructured`，时间倒序返回在库记忆）、无抛错、无用户可见错误；聊天主链路未受影响。
- **结论**：AC-3 语义召回 / AC-8 admin 补录带向量 / AC-5 回填脚本幂等的**真实调用**验收，仍待负责人在 `apps/api/.env` 填 `EMBEDDING_API_KEY`（或有效 `OPENAI_API_KEY`）并重启 api 后补跑（脚本入口 `pnpm --filter=@fairy/database backfill:embeddings`）。PROJECT_STATUS 的 In Progress 与 Risks 条目阻塞描述已改为精确状态，并新增 Last Updated 条目。
- **清理**：本次验收写入的测试记忆已删除（dev 库 user 画像恢复 3 条基线）；临时脚本 `apps/api/fu16-tmp.ts` 已删除。
- **踩坑（2 条）**：① tsx 临时脚本放 `apps/api/` 时，`../src/...` 相对导入实际解析到 `apps/src/...`，应为 `./src/...`；② 直接 tsx 跑的独立进程**不加载 `.env`**（`dotenv/config` 只在 api 服务端入口生效），env 存在性要在 `.env` 文件层核实——核实脚本只打印存在性与长度，不回显密钥值（AGENTS §0/§14）。

---

## 同日再追加：高德地图真机复验 + LngLat P0 缺陷修复（结论：前端链路已通，剩 owner 配「Web服务」key）

- **背景**：负责人按前期指引配好两把 key（`apps/web/.env` 的 `VITE_AMAP_JS_KEY` = Web端(JS) key、referrer 白名单 `local.fairy.dev` + hosts 映射；`apps/api/.env` 的 `AMAP_SERVER_KEY`）并要求「key 别推上去」。目标：真机验收 AC-4 地图 marker/折线。
- **三大发现**：
  1. **前端 key 链路全通**（dev server 从 `local.fairy.dev` 访问）：页面内按组件同款方式注入 `webapi.amap.com/maps?v=2.0&key=...` 脚本成功、`window.AMap` 2.0 就位、`AMap.Map/Marker/Polyline` 可用、防盗链白名单通过。
  2. **P0 缺陷：地图从不渲染的真因**（§15.2 P0 豁免修复，阻塞已批准功能验收）。`TripMap.createOverlay` 给高德传裸 `{lng,lat}` 对象，高德 JS API **2.0 坐标只认 `LngLat` 实例**——裸对象被静默归一成 `LngLat(NaN,NaN)`，直到 `new Marker/Polyline` 构造时才以 `Pixel(NaN,NaN)` 抛出，正好落进组件「script 失败 → setFailed → 静默撤容器」的降级路径，表现为地图整块消失且零报错。stub 单测的假 AMap 来者不拒，从未暴露。修复只动与高德的边界：统一 `new namespace.LngLat(lng,lat)` 后传入 Map/Marker/Polyline，`AmapNamespace` 补 `LngLat` 构造器声明；测试假命名空间改**严格** stub（复刻真实约束：非 LngLat 实例即抛），TripMap 7 例全绿、全量 web 126 全绿、typecheck、eslint 通过。真机复验修复有效：真实页面渲染修复后组件（fixture 2 个有坐标 POI + route，接已加载真实 AMap 2.0）——容器渲染、2 个 `.amap-marker` DOM、3 张瓦片 `<img>`、`setFitView` 正常。
  3. **剩余阻塞（owner 项）**：`AMAP_SERVER_KEY` 平台不匹配——直连 `restapi.amap.com/v3/place/text` 返回 `status:"0" info:"USERKEY_PLAT_NOMATCH" infocode:"10009"`（Web服务 API 只收「Web服务」平台 key，现放的是 JS 平台那把）→ `searchPoi` 全降级 null → 库内 0 条行程带坐标 → 地图按设计静默不渲染。修复路径纯配置：控制台为同一应用添加「Web服务」平台 key（本地 IP 白名单留空）→ 替换 `AMAP_SERVER_KEY` → 重启 api → 新建行程复验全链路。
- **踩坑（7 条）**：
  1. **`/@vite/env` 的 `defines={}` 是红鲱鱼**：那里只承载 `config.define` 自定义项；`import.meta.env.*` 走 define 插件**逐模块内联**（转换后模块里直接出现 `import.meta.env = {...}` 整个对象）。判断 env 是否注入要拉取转换后模块（`/src/...tsx`）看替换结果，别看 `/@vite/env`——本次为此多绕了一圈。
  2. **TaskStop 一个后台任务会连带杀掉同批启动的所有后台 node 进程**：api（tsx watch）+ web（程序化 createServer）同时消失（netstat 无 listener、tasklist 无 node.exe），curl 变 000。重启两个即可，但别误判为「服务崩溃」。
  3. **IAB WebView 没有 `window.HTMLInput`**：React 受控输入的 native setter 要从**元素自身原型链**取（`Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")`），不能假设 HTMLInput/HTMLTextAreaElement 全局存在。
  4. **`TripMap` 只挂 `TripTimeline`（对话页行程卡片）**：`/trips` 行程详情页从不渲染地图；聊天历史里的 trip 卡片由 `dtoToMessage` 从 SSE trip 事件还原，所以要在对话页等卡片，不要去详情页找。
  5. **高德双 key 平台不能互换**：`webapi.amap.com`（JS）只认 Web端 key + referrer 白名单；`restapi.amap.com`（Web服务）只认 Web服务 key，放错报 `USERKEY_PLAT_NOMATCH`(10009) 且**不影响前端任何表现**（后端 POI 坐标静默全空）。
  6. **Playwright `page.evaluate` 里不能用动态 `import()`**（报 `importModule is not defined`）：改用 `type="module"` script 标签注入，结果写 `window.__acceptResult` 再读。
  7. **高德 2.0 默认栅格瓦片是 `<img>`**：验证渲染要看 `.amap-marker` DOM 数与瓦片 img 数，canvas 层 0×0 不代表没渲染（曾据此误判一次）。
- **密钥安全**（负责人明确要求）：三份 `.env` 均被 `Fairy/.gitignore:11` 命中、`git ls-files` 0 跟踪、提交前 diff 扫描 0 处 32-hex；所有探针脚本只在内存读 key、只回传 status/info/count；临时脚本（api 4 个 + web 1 个）全部删除，`git status` 仅剩 TripMap.tsx/TripMap.test.tsx 与本文档/PROJECT_STATUS。
- **提交**：`web: convert trip map coordinates to LngLat instances`（P0 修复 + 严格 stub 回归）+ 文档（PROJECT_STATUS 五处 + 本 journal）。分支 `feature/travel-planning-phase-2` 未推送（领先 master 37 提交）。

---

## 同日再追加（三）：真实坐标全链路 + AC-4 真机验收闭环（Web服务 key 配置后）

- **触发**：负责人按上次登记的路径在高德控制台为同一应用添加「Web服务」平台 key，填入 `apps/api/.env` 的 `AMAP_SERVER_KEY` 并重启 api。
- **服务端恢复证据**：restapi probe 返回 `status:"1" info:"OK" pois:20`（此前 `USERKEY_PLAT_NOMATCH`/10009）；新建行程「帮我规划周末去杭州玩」落库后 DB 记录 16 步中 9 步 POI 带坐标（断桥残雪/白堤/浙江省博物馆等）、route 3 段非空。
- **真机 AC-4（本批验收核心）**：`local.fairy.dev` 源 + 双 dev server 真实浏览器，聊天行程卡片内地图容器 662×192、`.amap-marker` DOM ×9（与 9 个有坐标 POI 精确一致）、折线 SVG overlay ×1、瓦片 `<img>` ×10、amap-maps/controls/logo/copyright 层齐全、`window.AMap` 2.0 就位、模块内 key 字面量已内联——marker+折线+瓦片全链路渲染，AC-4 闭环。FU-19 地图链路至此全项闭环，无剩余 owner 待办。
- **踩坑复现（1 次，非新增）**：TaskStop 连带杀光同批 node 进程的坑第 3 次踩到（重启 api+web 即可，勿误判服务崩溃）。
- **清理与安全**：临时探针 `apps/api/trip-check-tmp.ts` 删除，`git status` 干净；三份 `.env` 均被 `Fairy/.gitignore:11` 命中、0 跟踪、提交 diff 0 处 32-hex、全程无 key 回显。
- **提交**：`docs: sync the spine after final amap map acceptance`（PROJECT_STATUS 五处 + 本 journal）。（本提交后分支已推送 origin，见下节。）

---

## 同日再追加（四）：分支推送 origin（推送前隐私/密钥扫描）+ FU-16 key 复核（仍 owner-blocked）

- **推送**（负责人指示事项 1）：`git push -u origin feature/travel-planning-phase-2` 成功——44 提交（FU-19 9 + `chore/reliability-fixes` 基座 35；origin/master 未含可靠性整改与 FU-19 工作，合并走 PR）。2026-09-20 那次 GitHub git 端口被 DNS 阻断需走 API 重建提交，本次直连正常、未复现。
- **推送前安全扫描**（负责人要求「注意隐私别推上去」）：`master..HEAD` 全 diff 扫 sk-/ghp_/AIza/sk-ant-/私钥头/32-hex 均 0 命中；`git ls-files` 0 个真实 `.env`（3 个 `.env.example` 内容全占位：`your_*_here`/localhost）；无 >1MB 文件；diff 内唯一邮箱为负责人既有 git 作者邮箱且 origin/master 历史早已包含——无新增隐私暴露。
- **FU-16 复核**（事项 3，仍 owner-blocked）：三个 `.env` 逐一核实 `EMBEDDING_API_KEY` 均未配置、`apps/api/.env` 的 `OPENAI_API_KEY` 空占位、无 `.env.local`；`ai-sdk/src/factory.ts:111` 只认 `EMBEDDING_API_KEY`→回退 `OPENAI_API_KEY`。在用的 `DEEPSEEK_API_KEY` 有效但 DeepSeek 无 embedding 接口，不能替代。真实 embed 落库/语义召回/回填幂等验收待负责人填 key 后补跑（restart api）。
- **文档修正**：本文档第三节「未推送」记载已改；PROJECT_STATUS 新增 Last Updated 条记录推送与 FU-16 复核。

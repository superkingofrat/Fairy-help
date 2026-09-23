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

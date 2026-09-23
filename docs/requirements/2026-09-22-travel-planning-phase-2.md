# 需求：旅行规划二期 —— REST 行程端点 + 历史行程回放 + 高德地图叠加

> 状态：**draft**（2026-09-22，grill-me 收敛，待用户批准）· 日期：2026-09-22 · 负责人：Flores
> 轨道：OpenSpec（大变更：跨 api + shared + web + db 分层、新增公共 API 端点、落地 `ARCHITECTURE.md` §3.1 地图蓝图；**本期不改 chat SSE `trip` 契约形状**）
> 前置：FU-13 旅行规划一期（chat 内对话行程生成）已交付归档；本期承接一期 `design.md` 明示推迟的三项二期待办——REST `POST /api/trips`、Trip 读取契约、前端 Amap JS 地图叠加。

## 背景 / 问题

1. **行程只能「聊出来」，没有主动创建入口**：FU-13 只把行程生成接进了 chat 链路。用户想不经过对话直接规划（未来从 `/trips` 页选目的地+天数生成，或脚本/自动化调用）没有 REST 契约；`API_CONTRACT.md` §5「未来端点」自登记起就挂着 `POST /api/trips`。
2. **历史行程散落在会话里**：`Trip` 表一直在落库（`userId/destination/days/itinerary/route/status` + `@@index([userId, createdAt])`，`TripStatus` 当前恒 `DRAFT`），但想找回某次行程只能去翻聊天记录找回放卡片，没有独立的历史列表与详情入口。
3. **地图路线一直没落地**：`ARCHITECTURE.md` §3.1 蓝图写明「`TripTimeline` 展示生成的行程，叠加地图路线」「地图渲染**仅**使用客户端 Amap JS API。服务端 Amap 密钥保持私密」，一期以「依赖真实密钥环境」为由推迟；`apps/web/.env.example` 的 `VITE_AMAP_JS_KEY` 自登记起即是死变量。
4. **降级哲学必须延续**：一期大量验收是在无 `AMAP_SERVER_KEY` 环境下完成的（POI `validated=false`、`route=null`、纯文本摘要照常可读）。二期地图必须在同一哲学下降级：无前端 key、无坐标、地图脚本加载失败都不崩、不渲染空白容器。

## 目标

1. **`POST /api/trips`**：Bearer-only 主动创建行程。复用 `planTripTool` 同一套「LLM 草稿 → Amap 校验 → 事务落库 → 行为日志」链路，不造第二套行程生成实现（对齐 FU-6 REST 借阅复用 `borrowMovieTool` 的先例）。角色门禁与 chat trip 分支一致：`role ∈ {admin, agent}` 放行，其余 403 `TRIP_FORBIDDEN`（且不调 LLM、不落库）。
2. **历史行程读取**：`GET /api/trips`（本人列表，时间倒序 + 分页；admin 可 `?userId=` 代查，对齐 `GET /api/rentals` 约定）+ `GET /api/trips/:id`（详情，仅本人或 admin，他人 id 404 `TRIP_NOT_FOUND` 防枚举）。
3. **`/trips` 页面**：行程列表 + 详情渲染（复用 `TripTimeline`）；加载/错误/空态齐全；文案全 i18n。
4. **地图叠加**：`TripTimeline` 集成客户端 Amap JS API 地图（POI 标记 + 路线折线）；对话内 trip 卡片与 `/trips` 详情同权展示。无 `VITE_AMAP_JS_KEY` / POI 无坐标 / 脚本加载失败时，地图区块整体隐藏，回落既有文本摘要（含 `validated` 徽标）。

## 范围

- **shared（`packages/shared/src/schemas/tripSchemas.ts`）**：新增 `tripCreateRequestSchema`（`destination` 1–100 字必填、`days` 可选 int 1–14）、`tripListItemSchema`（`id/destination/days/validated/createdAt`）、`tripDetailSchema`（`tripResultSchema` + `createdAt`）、`tripListFeedSchema`（`items` + `pagination`，对齐 rentals 列表信封习惯）+ 类型导出 + 测试。地图不引入新形状——POI 的 `location: {lng,lat} | null` 与 `route: RouteLeg[] | null` 即是地图输入。
- **api**：新增 `routes/trips.ts`（`POST /`、`GET /`、`GET /:id`）+ `controllers/tripController.ts` 薄 handler；新增 `services/tripService.ts`（`createTrip` 导出/复用 `planTripTool` 能力、`listTrips`、`getOwnedTrip`）；`app.ts` 挂载 `/api/trips`，鉴权走现有 `authMiddleware`。错误码：400 `VALIDATION_ERROR` / 403 `TRIP_FORBIDDEN` / 404 `TRIP_NOT_FOUND` / 401，统一 `{code,data,msg}` 信封。
- **web**：新增 `lib/tripApi.ts`（`createTrip`/`listTrips`/`getTrip`，复用 `lib/http` 统一客户端与错误归一化 `lib/errorMessages.ts`）；新增 `/trips` 页面（`components/trips/` 或 `pages/`，按现有目录约定）+ 导航入口「行程」+ 路由 `RequireAuth`；新增 `components/chat/TripMap.tsx`（Amap JS API 动态 script 加载 + `window.AMap` Promise 封装，内置三种降级）；`TripTimeline` 增加地图槽位；`locales/zh-CN.json` 全量文案。
- **地图安全**：只用前端**安全密钥（referrer 受限）**（ARCHITECTURE §10 既有约定）；`VITE_AMAP_JS_KEY` 为 build-time 内联（同 `VITE_API_URL` 语义，换域名/换 key 需重新 build）；`apps/web/.env.example` 补注释说明；`docs/deployment.md` 补 referrer 配置步骤。服务端 `AMAP_SERVER_KEY` 不进任何前端产物。
- **文档**：`API_CONTRACT.md` 新增 trips REST 节（三端点 + 错误码表），§5 移除 `POST /api/trips` 并顺手清理已过期的 `GET /api/admin/insights` 条目（该能力已由 FU-11 的 `GET /api/insights/overview` 交付，上轮核对发现的漂移）；`ARCHITECTURE.md` §3.1 蓝图注记落地、§5.3 流程补 REST 分支、§8 决策行（地图 build-time key 与降级、REST 复用 planTripTool）、§9 模块图；`docs/tools.md` 若 `planTripTool` 入口面变化则同步；`PROJECT_STATUS.md`。

## 非目标

- **具体日期语义**（`Trip.dates` 日历计算）——FU-13 design 已明确推迟，本期仍只到 `days` 天数。
- **行程编辑 / 删除 / 状态流**——`TripStatus` 只有 `DRAFT` 且无管理操作，本期不动。
- **多城市 / 酒店 / 交通预订**等行程丰富度。
- **chat SSE `trip` 事件形状变更**——零改动；地图是渲染层能力，事件数据不变。
- **admin 行程管理页**（`/admin/trips`）——本期只做用户侧 `/trips`；admin 代查仅 REST `?userId=`。
- **多地图供应商 / 离线地图**。

## 受影响模块

| 模块 | 改动 |
|---|---|
| `packages/shared` | `tripSchemas` 增 create/list/detail/feed 四 schema + 类型 + 测试 |
| `apps/api` | 新增 `routes/trips.ts`、`controllers/tripController.ts`、`services/tripService.ts`；复用 `tools/planTripTool.ts` 与 `role` 门禁约定；`app.ts` 挂载 |
| `apps/web` | `lib/tripApi.ts`；`/trips` 页（列表 + 详情 + 三态）；`components/chat/TripMap.tsx`；`TripTimeline` 地图槽位；导航/路由；i18n |
| 文档 | `API_CONTRACT.md`（新节 + §5 清理）、`ARCHITECTURE.md`（§3.1/§5.3/§8/§9）、`docs/deployment.md`（referrer 配置）、`PROJECT_STATUS.md` |

## 验收标准（草案）

- **AC-1**：`POST /api/trips`（Bearer agent/admin，双 dev server 真机）——`{destination:"杭州", days:2}` → 201 `{code:"OK", data:<tripResult 形状>, msg}`；DB `Trip` 落库 + `TRIP_PLANNED` 行为日志；缺 `destination` → 400 `VALIDATION_ERROR`；普通 user 角色 → 403 `TRIP_FORBIDDEN` 且 LLM 未调用、无落库、无日志。
- **AC-2**：`GET /api/trips`——本人行程时间倒序 + 分页；admin `?userId=<他人>` 代查成立；无 token 401；信封 `{code:"OK", data:{items, pagination}, msg}`。
- **AC-3**：`GET /api/trips/:id`——本人 200 且详情与 chat SSE 事件形状一致（tripResult + createdAt）；他人 id → 404 `TRIP_NOT_FOUND`（不泄漏存在性）；随机 UUID 404。
- **AC-4**：地图（配置 `VITE_AMAP_JS_KEY`）——`/trips` 详情与 chat 内 trip 卡片均渲染地图：POI 标记数量/位置与 `itinerary` 有坐标条目一致、无坐标 POI 被跳过、`route` 非空时绘折线。
- **AC-5**：地图降级——无 `VITE_AMAP_JS_KEY` / POI 全无坐标 / 脚本加载失败三种情况下，地图区块整体不渲染、文本摘要照常、无控制台未捕获错误、无空白占位容器。
- **AC-6**：测试——shared schema 四件套；api 路由（201/400/403/404、admin 代查、他人 404）；web（tripApi、`/trips` 页三态、`TripMap` 三种降级、`TripTimeline` 集成）；全程 mock DB/LLM/地图，不碰真实库与供应商；三包 typecheck + `pnpm run ci` 全绿。
- **AC-7**：双 dev server 真机 E2E——agent 账号 `/trips` 新建行程 → 列表/详情/地图全通 → chat 里再生成一个同可看地图；换普通 user：`POST /api/trips` 403、`GET /api/trips` 只回本人（空）。

## 待决问题（默认倾向，提案阶段定稿）

1. **历史回放靠新端点还是只靠会话回放？** 默认倾向：**新端点 + `/trips` 页**。行程散落在多个会话里无法聚合浏览，且 `API_CONTRACT.md` §5 已预留 `POST`、FU-13 design 明示「读取契约优先级与形状届时再走需求流程」。若倾向只靠会话回放，可砍掉 `GET` 两端点与 `/trips` 页，范围显著变小。
2. **`POST` 请求体是否带 `days`？** 默认倾向：带，可选 int 1–14；不传则由 LLM 草稿决定（保持一期行为）。
3. **地图加载方式**：默认倾向**动态 script 注入 + `window.AMap` Promise 封装**（零新增 npm 依赖，沿 `@fairy/ai-sdk`「纯 fetch 零依赖」先例）；备选 `@amap/amap-jsapi-loader`。
4. **无 key 时是否提示「未配置地图」？** 默认倾向：**静默隐藏**——服务端 `AMAP_SERVER_KEY` 缺失也是静默降级（`validated=false` 徽标已表达），一致性哲学的延伸；需要显式提示则提案阶段加一条 i18n。
5. **admin 行程管理面**：默认不做（`?userId=` 代查已覆盖排查需求）；确需 `/admin/trips` 另立需求。

## Why

FU-13（旅行规划一期，已归档）只把行程生成接进了 chat 链路：行程「只能聊出来」、历史行程散落在会话记录里翻不回、`ARCHITECTURE.md` §3.1 蓝图要求的「TripTimeline 叠加地图路线」至今未落地（`VITE_AMAP_JS_KEY` 是 `.env.example` 里的死变量）。需求文档已批准（[docs/requirements/2026-09-22-travel-planning-phase-2.md](../../docs/requirements/2026-09-22-travel-planning-phase-2.md)）。本期交付**旅行规划二期**：REST `POST /api/trips` 主动创建 + `GET /api/trips` 系列历史回放 + 客户端 Amap JS API 地图叠加；chat SSE `trip` 契约零变更。

## What Changes

- **共享（packages/shared）**：`tripSchemas.ts` 增加 `tripCreateRequestSchema`（`destination` 1–100 字必填、`days` 可选 int 1–14）、`tripListItemSchema`（id/destination/days/validated/createdAt）、`tripDetailSchema`（`tripResultSchema` + `createdAt`）、`tripListFeedSchema`（items + pagination）+ 类型 + 测试。地图不引入新形状，直接消费 POI `location` 与 `route`。
- **后端（apps/api）**：
  - 新增 `routes/trips.ts`：`POST /api/trips`（Bearer-only；`role ∈ {admin, agent}` 放行，其余 403 `TRIP_FORBIDDEN` 且不调 LLM、不落库；复用 `planTripTool` 同一「LLM 草稿 → Amap 校验 → 事务落库 → TRIP_PLANNED」链路，不造第二套行程生成实现）；`GET /api/trips`（本人时间倒序分页，admin `?userId=` 代查，对齐 `GET /api/rentals` 约定）；`GET /api/trips/:id`（仅本人或 admin，他人 id 404 `TRIP_NOT_FOUND` 防枚举）。
  - 新增 `services/tripService.ts`（create/list/getOwned）+ `controllers/tripController.ts` 薄 handler；`app.ts` 挂载；错误码 400 `VALIDATION_ERROR` / 403 `TRIP_FORBIDDEN` / 404 `TRIP_NOT_FOUND` / 401，统一 `{code,data,msg}` 信封。
- **前端（apps/web）**：新增 `lib/tripApi.ts`（复用 `lib/http` 与 `lib/errorMessages` 错误归一化）；新增 `/trips` 页（列表 + 详情复用 `TripTimeline`，加载/错误/空态齐全）+ 导航入口 + 路由 `RequireAuth`；新增 `components/chat/TripMap.tsx`（Amap JS API 动态 script 加载 + `window.AMap` Promise 封装，零新增 npm 依赖）；`TripTimeline` 增加地图槽位，对话内 trip 卡片同权展示；文案走 `locales/zh-CN.json`。无 `VITE_AMAP_JS_KEY` / POI 无坐标 / 脚本加载失败时地图区块整体隐藏、回落既有文本摘要（延续一期服务端 key 缺失的静默降级哲学）。
- **地图密钥安全**：只用前端安全密钥（referrer 受限，ARCHITECTURE §10 既有约定）；`VITE_AMAP_JS_KEY` build-time 内联（同 `VITE_API_URL` 语义）；`apps/web/.env.example` 补注释；`docs/deployment.md` 补 referrer 配置步骤；服务端 `AMAP_SERVER_KEY` 不进任何前端产物。
- **文档**：`API_CONTRACT.md` 新增 trips REST 节，§5「未来端点」移除 `POST /api/trips` 并顺手清理已过期的 `GET /api/admin/insights`（该能力已由 FU-11 `GET /api/insights/overview` 交付）；`ARCHITECTURE.md` §3.1/§5.3/§8/§9 同步；`PROJECT_STATUS.md`。
- **无破坏性变更**：chat SSE `trip` 事件形状不变；`Trip` 表无迁移（本期不碰 `TripStatus` 状态流）；一期指令规则、门禁、降级行为不变。

## Capabilities

### New Capabilities

（无——地图与 REST 均属 travel-planning 既有能力的行为扩展）

### Modified Capabilities

- `travel-planning`: 在既有「chat 内行程规划与时间轴渲染」之外，新增 ① REST 主动创建行程（`POST /api/trips`，角色门禁 + 复用同一生成落库链路）；② 行程历史读取（`GET /api/trips` 本人列表 / admin 代查 + `GET /api/trips/:id` 本人或 admin）；③ 时间轴地图叠加（TripTimeline 渲染 Amap JS API 地图：POI 标记 + 路线折线，无 key/无坐标/加载失败整体隐藏回落文本摘要；地图仅用 referrer 受限前端密钥）。

## Impact

- 公共契约新增 3 个 REST 端点（`POST /api/trips`、`GET /api/trips`、`GET /api/trips/:id`，其中列表/详情为任意已登录角色，POST 限 admin/agent）；共享 schema 经 `packages/shared`；SSE 协议不变。
- 数据库无迁移（复用 `trips` 表与既有索引）。
- 新增前端依赖：无（Amap JS API 走动态 script 注入）；新增前端环境变量语义说明：`VITE_AMAP_JS_KEY`（已登记于 `.env.example`，build-time 内联）。
- 测试：shared schema 四件套；api（路由 201/400/403/404、admin 代查、他人 404 + tripService list/get 隔离）；web（tripApi、`/trips` 页三态、TripMap 三种降级、TripTimeline 集成）；全程 mock，CI 不调真实 LLM/Amap。
- 真机验收覆盖：agent/admin POST 创建落库与日志、普通 user 403、跨用户读取隔离、地图标记/折线与无 key 降级。

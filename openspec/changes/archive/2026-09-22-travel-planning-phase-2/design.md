## Context

- `planTripTool`（`apps/api/src/tools/planTripTool.ts`）已包含完整链路：画像 travelStyle → `draftTrip`（低温度 0.2、重试 3 次、maxTokens 1200）→ Amap POI/路线校验（key 缺失静默降级）→ 事务落库 `Trip` + `TRIP_PLANNED`/`TRIP_UNRESOLVED`/`TRIP_DRAFT_FAILED` 日志 → 返回 `TripResult`。签名是 `{ userId, message }` in / `{ success, data: TripResult | { unresolved } } | { error }` out。
- `Trip` 表与 `tripSchemas`（tripResult/POI/RouteLeg）自 FU-13 起未变；`TripStatus` 恒 `DRAFT`。
- 列表信封既有惯例：memory 管理面用 `{ items, pagination: { page, limit, total, totalPages } }`；rentals 无分页。行程按用户累积，选分页形状。
- `VITE_AMAP_JS_KEY` 已在 `apps/web/.env.example` 登记但从未被消费；`VITE_API_URL` 已确立 build-time 内联语义。
- 约束（AGENTS）：统一 `{code,data,msg}` 信封；共享 schema 只在一处声明；密钥只走 env；SSE `trip` 契约不变。

## Goals / Non-Goals

**Goals:**

- REST create 与 chat 走**同一条生成落库链路**，零第二实现；角色门禁先于任何 LLM 调用。
- 读取端点与既有 admin 代查（rentals `?userId=`）和列表信封（memory pagination）对齐。
- 地图零新增 npm 依赖；三种降级（无 key / 无坐标 / 加载失败）全部静默。
- 测试环境不依赖 LLM、真实 Amap、浏览器 key。

**Non-Goals:**

- 不改 `planTripTool` 内部 prompt/参数（除非验收暴露问题）；不改 SSE 协议；不动 `TripStatus`。
- 不做 `/admin/trips`；不做日期语义；不做行程编辑删除页。

## Decisions

### 1. REST create 直接调用 `planTripTool`，不抽 core、不复制

Route 层以 body 合成一条自然语言 message（`帮我规划${days ? ` ${days} 天的` : ""}${destination}行程`）后调 `planTripTool({ userId, message })`；tool 的 unresolved / TRIP_DRAFT_FAILED / 落库失败三分支原样映射为 REST 响应（unresolved → 400 `VALIDATION_ERROR`？见下）。
**理由**：链路唯一性优先（§0 数据一致性 + FU-6 先例）；抽 core 函数要改 chat 已验证路径，收益为零。body 的 `destination` 经 DRAFT 规则提取（「帮我规划杭州的2天行程」命中 DESTINATION_PATTERNS）比 LLM 自由提取更稳。
**备选（否决）**：复制一套 createTrip 逻辑——违反「复用优先」且双份 LLM prompt 必漂移。
**边界**：unresolved 在 REST 语境意味着「请求没给目的地」——但 schema 已强制 destination 必填，所以 unresolved 实际只可能来自 LLM 侧异常；映射为 502 语义不合适，定映射 **400 `TRIP_UNRESOLVED`**（与 chat 语义同名，前端可复用文案），TRIP_DRAFT_FAILED → **502 `TRIP_DRAFT_FAILED`**（LLM 故障，重试后仍败）。

### 2. 角色门禁放 controller 先于调 tool

对齐 chat `dispatch` trip 分支（`role ∈ {admin, agent}`，2026-09-22 身份化后的现行约定）：非放行角色直接 403 `TRIP_FORBIDDEN`，**不调 LLM、不落库、不写日志**（可测：mock planTripTool 断言未调用）。鉴权走既有 `authMiddleware`，`res.locals.role/userId`。

### 3. 读取端点：列表分页 + 详情 404 防枚举

`GET /api/trips`：`tripListQuerySchema`（page/limit/userId?）+ `tripService.listTrips`（where userId + orderBy createdAt desc + skip/take + count）；`userId` 参数仅 admin 可用，非 admin 传 `userId` → 403 `FORBIDDEN`（对齐 rentalsController 的 INVALID_USER_ID/FORBIDDEN 分支），admin 传不存在 userId → 404 `USER_NOT_FOUND`。信封 `{ items, pagination: { page, limit, total, totalPages } }`。
`GET /api/trips/:id`：`findUnique` 后所有权判定（`trip.userId === callerId || role === "admin"`），否则与不存在同返 404 `TRIP_NOT_FOUND`。详情 data = `tripResultSchema` 形状 + `createdAt`（`tripDetailSchema`，shared 侧由 tripResult 扩展）。
**理由**： rentals 已有 `?userId` 代查先例；404 防枚举是 §14 系安全惯例。

### 4. TripMap：动态 script 注入 + window.AMap Promise 单例，零依赖

`components/chat/TripMap.tsx`：key 缺失 → 返回 null；否则模块级 `loadAmap()` Promise（去重、失败缓存 reject 不再重试风暴）；组件内 `useEffect` 创建 `Map` + `Marker[]`（仅 location 非空 POI）+ `Polyline`（route 非空且 ≥2 段折线点取自 POI 坐标顺序——route leg 只有 from/to 名称，折线点由 itinerary 的有坐标 POI 顺序推导）。脚本：`https://webapi.amap.com/maps?v=2.0&key=${key}`。容器显式宽高（纯 CSS，不内联布局样式，§4 前端约定）。
**备选（否决）**：`@amap/amap-jsapi-loader`——引入唯一用途的 npm 依赖，与本仓 ai-sdk「纯 fetch 零依赖」取向相反。
**降级**：`loadAmap()` reject → 组件置 `failed` 状态返回 null（静默，spec 约束）。

### 5. TripTimeline 地图槽位内聚判断

`TripTimeline` 内部决定：`AMAP_KEY`（`import.meta.env.VITE_AMAP_JS_KEY`）非空 **且** 存在至少一个带坐标 POI → 渲染 `<TripMap>`；否则不渲染地图区域。对话内卡片与 `/trips` 详情同走此组件，行为自动一致。
**理由**：判断条件只依赖 trip 数据本身，放最靠近数据的组件，两个消费点零接线。

### 6. `/trips` 页与导航

新增 `components/trips/TripsPage.tsx`（对照 `components/library/MovieLibraryPage` 落位）：列表（分页 + 空态）+ 选中详情（TripTimeline + 地图）+ 创建表单（destination + days，仅 admin/agent 见表单；普通用户只读列表，POST 403 由前端拦截避免无谓请求——文案引导）。`App.tsx` 加 `Route path="/trips"` + 导航入口「行程」。`lib/tripApi.ts` 走 `lib/http`（401 单飞刷新/错误码归一化自动继承）。

## Risks / Trade-offs

- **LLM 返回 destination 与 body 不一致**（合成消息被模型忽略）→ 以链路唯一性优先不做事后校验；AC-1 真机断言 data.destination == 请求值；若漂移显著再在 controller 加轻量比对（记入 tasks 的可选项）。
- **`import.meta.env` 在 vitest/jsdom 的行为**：jsdom 无该对象时 TripMap 模块级读取会 undefined——测试用 `vi.stubEnv`/define 处理；模块内访问而非顶层常量求值一次，避免 stub 时序问题。
- **地图脚本被浏览器拦截/企业网不通**：静默降级已覆盖；发布后验证清单加一条「地图区块可见性」人工确认。
- **`window.AMap` 2.0 全局名的 jsdom 测试**：用 `vi.stubGlobal("AMap", FakeAMap)` + stub script onload；断言 Marker/Polyline 构造参数而非真实渲染。
- **契约 §5 清理**：移除 `GET /api/admin/insights` 过期条目属顺带文档修正，在 tasks 单列一行，避免与功能变更混淆评审。

## Migration Plan

- 无 DB 迁移、无种子变更。`VITE_AMAP_JS_KEY` 为 build-time 变量：web 重新 build（Dockerfile 已支持 build ARG 注入模式，参照 `VITE_API_URL`）；不配置则地图静默隐藏，不影响其余功能。
- 回滚：去掉路由挂载与导航入口即可，`Trip` 表数据保留（无 schema 依赖）。

## Open Questions

- 折线点推导在「POI 部分无坐标」时不连续（缺段）——可接受（只连有坐标的连续段），实现期定，不改变 spec。

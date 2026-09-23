# Tasks: 2026-09-22-travel-planning-phase-2

## 1. shared：行程 REST/读取 schema

- [x] 1.1 `tripSchemas.ts` 增 `tripCreateRequestSchema`（destination 1–100 必填、days 可选 int 1–14、未知键剥除）+ `tripListItemSchema`（id/destination/days/validated/createdAt）+ `tripDetailSchema`（tripResultSchema.extend({ createdAt })）+ `tripListQuerySchema`（page/limit/userId?）+ `tripListFeedSchema`（items + pagination {page,limit,total,totalPages}）+ 类型导出
- [x] 1.2 shared 测试：create 请求校验（必缺/超长/days 越界）、list item 形状、detail 由 tripResult 扩展、query 默认值与剥键；`pnpm --filter=@fairy/shared typecheck` + test

## 2. API：POST /api/trips 与历史读取

- [x] 2.1 `services/tripService.ts`：`createTrip` 复用 `planTripTool`（body 合成 message，映射 unresolved → TRIP_UNRESOLVED / 草稿失败 → TRIP_DRAFT_FAILED）；`listTrips(userId, query)`（where userId + createdAt desc + skip/take + count）；`getOwnedTrip(tripId, callerId, role)`（不存在或非本人非 admin → null，controller 统一 404）
- [x] 2.2 `routes/trips.ts`：`POST /`（controller 先判 `role ∈ {admin, agent}`，否则 403 TRIP_FORBIDDEN 且不调 tool；validateBody tripCreateRequestSchema）+ `GET /`（分页；userId 仅 admin：非 admin 传 userId → 403 FORBIDDEN，admin 传未知 → 404 USER_NOT_FOUND）+ `GET /:id`（404 TRIP_NOT_FOUND 防枚举）；`controllers/tripController.ts` 薄 handler；`app.ts` 挂载 `/api/trips`
- [x] 2.3 api 测试：POST 201 落库+TRIP_PLANNED（mock planTripTool）/ user 角色 403 且 tool 未调用 / 缺 destination 400 / unresolved 与 draft-failed 映射；列表分页信封形状 + admin ?userId= 代查 + 非 admin 代查 403；详情本人 200、他人/未知 404；既有 chat/trip 用例保持绿

## 3. Web：行程地图组件

- [x] 3.1 `components/chat/TripMap.tsx`：`loadAmap()` script 注入 Promise 单例（v=2.0、key 来自 `import.meta.env.VITE_AMAP_JS_KEY`，key 缺失返回 null、加载失败静默）；地图容器纯 CSS 尺寸；POI Marker（仅 location 非空）+ Polyline（route 非空时按 itinerary 有坐标 POI 顺序连线，缺段可断）
- [x] 3.2 TripMap 测试：无 key 不加载脚本；加载失败不渲染容器；有坐标渲染 Marker/Polyline（stub `window.AMap`）；无坐标 POI 被跳过；route null 不画线
- [x] 3.3 `TripTimeline` 增加地图槽位：key 存在且至少一个 POI 有坐标时渲染 `<TripMap>`；既有三态/回放用例保持绿，补集成用例

## 4. Web：/trips 页与入口

- [x] 4.1 `lib/tripApi.ts`：createTrip/listTrips/getTrip（复用 `lib/http`，错误码走 `lib/errorMessages`）
- [x] 4.2 `components/trips/TripsPage.tsx`：行程列表（分页 + 加载/错误/空态）+ 详情（TripTimeline + 地图）+ 创建表单（destination + days；非 admin/agent 隐藏表单）；`App.tsx` 加路由 `RequireAuth` + 导航「行程」；i18n 全量
- [x] 4.3 web 测试：tripApi 信封/400/403；TripsPage 列表/详情/空态/表单提交与 403 提示；既有 App/导航用例保持绿

## 5. 文档脊柱

- [x] 5.1 `API_CONTRACT.md`：新增 trips REST 节（POST/GET 列表/GET 详情 + 错误码表 TRIP_FORBIDDEN/TRIP_NOT_FOUND/TRIP_UNRESOLVED/TRIP_DRAFT_FAILED）；§5「未来端点」移除 `POST /api/trips` 并清理过期条目 `GET /api/admin/insights`（FU-11 已以 `/api/insights/overview` 交付，单独一行注明顺带修正）
- [x] 5.2 `ARCHITECTURE.md`：§3.1 地图蓝图注记落地、§5.3 流程补 REST 分支、§8 决策行（地图 build-time key 与静默降级、REST 复用 planTripTool）、§9 模块图补 TripMap/TripsPage/tripService
- [x] 5.3 `apps/web/.env.example` 补 `VITE_AMAP_JS_KEY` referrer 安全密钥注释；`docs/deployment.md` 补 key 配置与 build-time 重新构建说明
- [x] 5.4 `PROJECT_STATUS.md` 完成后移入 Completed Modules；requirements README 本行置 approved→implemented；`docs/requirements/2026-09-22-travel-planning-phase-2.md` 状态更新

## 6. 验证与归档

- [x] 6.1 三包 typecheck + shared/api/web 测试全绿 + `pnpm lint` + prettier；`pnpm run ci`；`openspec validate --all`
- [x] 6.2 真机验收（双 dev server，配可选 AMAP_SERVER_KEY 与 VITE_AMAP_JS_KEY）：AC-1 POST 201 落库 + 普通 user 403 不调 LLM；AC-2 列表倒序分页 + admin 代查；AC-3 详情本人 200/他人 404；AC-4 地图标记与折线；AC-5 无 key 无地图不报错；AC-6 单测覆盖；AC-7 agent /trips 全链路 E2E + 普通 user 空态
  - 验收方式与结果（2026-09-23）：AC-1 agent POST 201（destination 杭州 days 2，Trip 行 + TRIP_PLANNED 日志落库）；普通 user/未登录角色 403 TRIP_FORBIDDEN，DB 断言该用户 TRIP_* 日志与 Trip 行均为 0（门禁先于 LLM）。AC-2 列表 createdAt desc + limit 分页；admin ?userId= 200、非 admin 403 FORBIDDEN、非法 uuid 400 INVALID_USER_ID、未知 uuid 404 USER_NOT_FOUND。AC-3 本人详情 200；非本人与未知 id 同返 `{TRIP_NOT_FOUND, data:null}`，无存在性泄漏。AC-4/AC-5 由 TripMap 单测覆盖（stub window.AMap 断言 Marker/Polyline）；本机未配 VITE_AMAP_JS_KEY，真机验证无 key 时不渲染地图区块且 itinerary 正常（静默降级）。AC-6 单测：TripMap 7 + TripTimeline 集成 2 + TripsPage 9 + tripApi 5 + api trips 组。AC-7 浏览器 E2E：agent 登录 → /trips 表单创建「北京 1 天」→ 列表刷新置顶 + 成功提示 + 详情时间线（未验证/未核实标记）→ 地图不出现；退出后以普通用户登录，/trips 只读提示 + 「还没有行程记录」空态，无创建表单。备注：验收初期一次 TRIP_UNRESOLVED 系 curl 在 Git Bash 下发送非 UTF-8 body 导致目的地字节乱码（日志 codepoint 含 U+FFFD），改用 `--data-binary @file` 后链路全通；产品代码无相应缺陷。
- [x] 6.3 通过后 `openspec archive 2026-09-22-travel-planning-phase-2 --yes` + 移入 Completed Modules + Trellis journal 收尾（2026-09-23：归档完成，specs/travel-planning 已合并 +3~1；PROJECT_STATUS Completed Modules 顶部 + Decisions ×2 + Last Updated；requirements 文档与 README 置 implemented；journal 见 .trellis/workspace/flores/）

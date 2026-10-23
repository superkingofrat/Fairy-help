# Tasks: 2026-10-11-trip-companion-context

## 1. shared：同行人契约

- [x] 1.1 `tripSchemas.ts` 增 `tripCompanionSchema`（`name` min(1) + `userId` min(1)）与 `tripResultSchema.companion = tripCompanionSchema.nullable().default(null)`（键缺失与显式 null 等价，存量历史 `trip` 事件仍可解析）；导出 `TripCompanion` 类型
- [x] 1.2 shared 测试：合法对象通过、显式 `null` 通过、**缺键**解析为 `companion: null`（历史回放兼容）、缺 `name` 拒绝、`userId` 非字符串/空串拒绝；`tripEventSchema` 与 `tripDetailSchema` 继承验证；`pnpm --filter=@fairy/shared typecheck` + test
- [x] 1.3 手写 `TripResult` fixture 补 `companion: null`（typecheck 逐处指出：api chat/toolDispatcher/planTripTool/responseSynthesizer/trips、web TripTimeline/TripMap/TripsPage/tripApi/ChatPage）

## 2. API：带出去 + 落库 + 投影

- [x] 2.1 `planTripTool`：`prisma.trip.create` 的 `data` 增 `companionName`/`companionUserId`（与行程写入同一事务），返回 `TripResult` 增 `companion: companion ? { name: companion.name, userId: companion.userId } : null`（复用 FU-20 局部变量，不重解析）；`TRIP_PLANNED` payload 保持不变（未命中仍不新增键）
- [x] 2.2 `tripService.getTripDetail`：safeParse 入参加 `companion: row.companionName && row.companionUserId ? { name: row.companionName, userId: row.companionUserId } : null`（缺一即 null，不产半截对象）；`listTrips` 不动（列表项不需要同行人）；`createTrip` 随 tool 自动获得字段，零改动
- [x] 2.3 `responseSynthesizer.buildTripFacts`：`trip.companion` 非空时在 `facts` 末段（既有「不得编造」句之后）追加 `同行人：X。其偏好已体现在行程安排中，回复可把具体安排归属于该同行人；不得编造其未表达过的偏好。`；`template` 同步带出；无同行人时 facts/template 与改动前逐字一致
- [x] 2.4 api 测试：`planTripTool` 返回与 `Trip` 行两列（命中/未命中两态，含既有 FU-20 用例保持绿）；`getTripDetail` 投影（两列齐全→对象、任一为空→null）；`buildTripFacts` 归属行存在性与无同行人逐字一致；`trips.test.ts` 创建/详情透传 `companion`

## 3. 数据库：迁移 + 回填

- [x] 3.1 `schema.prisma` `Trip` 增 `companionName String?` / `companionUserId String?`（无 relation、无索引、无 `onDelete`，注释说明快照语义）；`pnpm --filter=@fairy/database migrate:dev --name add_trip_companion` + `generate`
- [x] 3.2 `scripts/backfill-trip-companions.ts`：扫 `BehaviorLog` 中 `action = "TRIP_PLANNED"` 且 payload 带 `companionName` 的记录，按 `payload.tripId` 定位 `Trip` 行，仅两列皆空时更新（幂等）；payload 只有 name 无 userId 的旧记录跳过并单独计数；逐条失败不中断，结束打印统计（已补/已跳过/失败/日志缺失）；`packages/database/package.json` 增 `backfill:trip-companions`
- [x] 3.3 dev 库跑一次回填并记录统计；脚本重跑一次验证「已补 0、无变化」

## 4. Web：行程卡片展示同行人

- [x] 4.1 `TripTimeline`：`trip.companion` 非空时在「N 天」行旁渲染「与 X 同行」（i18n 键 `chat.trip.companion`，文案 `与 {name} 同行`）；无同行人不渲染该节点
- [x] 4.2 web 测试：有同行人渲染「与 X 同行」、无同行人不渲染（且无空壳文案）；`TripTimeline.test.tsx` 既有用例保持绿；`/trips` 详情页经同组件自动覆盖，补一条集成断言

## 5. 文档脊柱

- [x] 5.1 `API_CONTRACT.md`：§3.15.1 创建响应示例与 §3.15.3 详情补 `companion`（含「无同行人为 `null`」说明）、§2 SSE `trip` 事件节字段清单补 `companion`
- [x] 5.2 `ARCHITECTURE.md`：§8 决策行（FU-20 行补「同行人进结果/落库/回放/回复归属」、无外键的快照语义、`.default(null)` 的历史兼容理由）、§9 模块图/数据流补 `Trip` 两列与回填脚本
- [x] 5.3 `PROJECT_STATUS.md`：完成后移入 Completed Modules；`docs/requirements/2026-10-11-trip-companion-context.md` 与 README 索引置 implemented

## 6. 验证与归档

- [x] 6.1 三包 typecheck + shared/api/web 测试全绿 + `pnpm lint` + prettier；`pnpm run ci`
- [x] 6.2 真机验收（双 dev server）：AC-1 对话内含已注册 persona 人名（莱卡恩）的请求 → SSE `trip` 事件带 `companion`、回复出现归属表述、卡片显示「与莱卡恩同行」；AC-2 `POST /api/trips` 创建后 `GET /api/trips/:id` 回读同一 `companion`、DB 两列非空；AC-3 无同行人请求 → `companion: null`、回复与 UI 与改动前一致；AC-4 回填脚本重跑无变化；AC-5 旧会话历史行程回放正常（存量 `trip` 事件无 `companion` 键不报错）
- [x] 6.3 通过后 `openspec archive 2026-10-11-trip-companion-context --yes` + 移入 Completed Modules + Trellis journal 收尾

## 1. 数据库

- [x] 1.1 `schema.prisma`：新增 `TripStatus` 枚举（`DRAFT`）+ `Trip` 模型（`userId`、`destination`、`days`、`itinerary` Json、`route` Json?、`status`、`@@index([userId, createdAt])`）；`BehaviorAction` 追加 `TRIP_PLANNED`
- [x] 1.2 生成迁移 `add_trip_model` 并 `migrate:dev` + `generate`

## 2. Shared 契约

- [x] 2.1 新增 `packages/shared/src/schemas/tripSchemas.ts`：`tripPoiSchema`/`itineraryDaySchema`/`routeLegSchema`/`tripResultSchema`/`tripEventSchema` + 类型
- [x] 2.2 `sessionSchemas.ts` 的 `chatEventSchema` 追加 `trip` 成员；经 `schemas/index.ts` 与 `src/index.ts` 导出
- [x] 2.3 新增 `tripSchemas.test.ts`：形状与 `chatEventSchema` union 断言
- [x] 2.4 `pnpm --filter=@fairy/shared build` + typecheck（供 api/web 消费）

## 3. API：amapClient + planTripTool

- [x] 3.1 新增 `services/amapClient.ts`：`searchPoi(keyword, city)`（高德 place text）+ `planRoute(from, to)`（路线规划），读 `AMAP_SERVER_KEY`（缺失/错误 → 降级信号），`fetch` 超时 guard
- [x] 3.2 新增 `tools/planTripTool.ts`：读画像 `travelStyle` → `tryChat("agent.trip")` LLM 草稿（zod 校验，destination/days/itinerary）→ Amap 校验 POI/路线（降级容忍）→ `prisma.trip.create` + `TRIP_PLANNED` 日志 → `{ success, data | { unresolved } , error }`
- [x] 3.3 新增 `__tests__/amapClient.test.ts`（mock fetch：命中/未命中/缺 key/超时）与 `planTripTool.test.ts`（mock LLM + amap + prisma：成功落库、无目的地 unresolved、LLM 失败 error、amap 不可用降级）

## 4. API：agent 链 + SSE

- [x] 4.1 `intentClassifier.ts`：`plan_trip` 意图（LLM 枚举 + 提示词示例；规则 `旅行|出游|行程|规划|想去|旅游|周末去哪|去…玩` 先于 LLM 短接，借→还→旅行→mood/scene→insight→unmatched）
- [x] 4.2 `planner.ts`：`{ tool: "trip" }`
- [x] 4.3 `toolDispatcher.ts`：`kind: "trip"` observation（`success`/`unresolved`/`trip`/`code`）+ `dispatch` 透传 `message`；`stateLoop.ts` 传 message
- [x] 4.4 `responseSynthesizer.ts`：trip 分支（成功行程摘要 / unresolved 追问 / 失败降级）+ `SynthesizedResponse.trip`
- [x] 4.5 `routes/chat.ts`：SSE 输出 `trip` 事件；`buildEvents` 与落库 payload 含 trip
- [x] 4.6 测试：`intentClassifier.test.ts`（plan_trip 规则短接/LLM/顺序）、`planner.test.ts`、`toolDispatcher.test.ts`、`responseSynthesizer.test.ts`、`chat.test.ts`（SSE 含 trip 事件）

## 5. Web

- [x] 5.1 `TripTimeline.tsx` 真实实现：目的地 + 天数分组 + POI 步骤 + 校验徽标 + 路线摘要（i18n）
- [x] 5.2 `ChatPage.tsx`：渲染实时 `trip` 事件 + 回放 payload 中的 trip 事件（`dtoToMessage` 扩展）
- [x] 5.3 i18n keys（`zh-CN.json`：chat.trip.*）
- [x] 5.4 新增 `TripTimeline.test.tsx` + ChatPage 测试更新

## 6. 文档与验证

- [x] 6.1 `API_CONTRACT.md`：SSE 事件表 `trip` 行 + 形状 + `AMAP_SERVER_KEY` 可选标注
- [x] 6.2 `ARCHITECTURE.md`：§8 决策 +1 行（plan_trip 规则先于 LLM；地图叠加二期）
- [x] 6.3 `docs/tools.md`：planTripTool 条目
- [x] 6.4 `PROJECT_STATUS.md`：FU-13 In Progress 进度更新
- [x] 6.5 验证：三包 typecheck + api/web/shared 测试全绿 + `openspec validate --all`
- [x] 6.6 真机验收 AC-1~AC-8（无 key 走降级；有 key 加验真实校验）
- [x] 6.7 归档：`openspec apply` → sync 主 spec → move change 至 archive → validate → journal → 提交

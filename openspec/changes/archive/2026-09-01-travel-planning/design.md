## Context

旅行规划自 MVP 起挂账：`amapClient.ts`/`planTripTool.ts`/`tripController.ts` 为 0 字节占位、`routes/trips.ts` 未挂载、`TripTimeline.tsx` 占位、agent 链与共享契约与 Prisma `Trip` 模型缺失。ARCHITECTURE.md §5.3 已有完整蓝图（`plan_trip` 意图 → `planTripTool`（画像 + LLM 草稿 + Amap 校验 POI + 路线）→ `Trip` 落库 → SSE 行程事件 → 前端 `TripTimeline`；服务端 Amap 密钥永不到达前端）。可复用的既有模式：FU-12 的 rules-first 确定性判定（insight 关键词先于 LLM）、`tryChat("agent.*")` + zod 校验 + 模板兜底、工具统一 `{ success, data, error }`、`TRIP_PLANNED` 追加式行为枚举、SSE 事件追加式 union（`chatEventSchema`）。动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- chat 内完整闭环：`plan_trip` → 行程草稿（画像 + LLM）→ Amap 校验 POI/路线（可选）→ `Trip` 落库 + 日志 → SSE `trip` 事件 + 文本回复 → 前端行程卡片（实时 + 回放）。
- 高德不可用/无 key 时优雅降级（`validated: false` + 无路线），不崩、不暴露密钥/堆栈。
- 全部向后兼容：SSE 新事件、`chatEventSchema` union 增成员、`BehaviorAction` 追加枚举值。

**Non-Goals:**
- 不做 REST `POST /api/trips` 与独立 trips 页面（API_CONTRACT 未来端点清单不变）。
- 不做前端地图叠加（Amap JS API 二期；ARCHITECTURE §3.1 蓝图保留）。
- 不做具体日期计算（「周末」→ day 1..N，不解析日历）、酒店/机票/多城市串联/费用估算。
- 不做行程编辑/取消/历史列表（`Trip` 落库仅为回放打底，本期无读取端点）。

## Decisions

1. **LLM 生成行程草稿 + Amap 校验（防幻觉）**
   `planTripTool` 先经 `tryChat("agent.trip")` 让 LLM 产出目的地 + 天数 + 每日步骤（时间/POI/类别/备注），再逐一调 `amapClient.searchPoi` 校验并替换坐标，相邻 POI 调 `planRoute` 得到路线。与 ARCHITECTURE §5.3 蓝图一致；备选「完全由 Amap 搜索生成」失去个性化，已否决。

2. **`plan_trip` 关键词先于 LLM（同 FU-12 store_insight 模式）**
   真机已验证 deepseek 对严格 JSON 输出不可靠（曾把运营问数误判 chitchat）。旅行关键词 `旅行|出游|行程|规划|想去|旅游|周末去哪|去…玩` 命中即返回 `plan_trip`，保证 AC-1 确定性；其余意图仍 LLM 优先、规则兜底。顺序：借 → 还 → **旅行** → mood/scene → insight → unmatched。

3. **`AMAP_SERVER_KEY` 可选 + 优雅降级**
   缺失/超时/报错 → `amapClient` 返回降级信号，工具跳过校验与路线，POI 标 `validated: false`、`route: null`，仍成功返回；不做启动必填（避免 CI/无 key 环境启动失败）。`.env.example` 已登记占位。

4. **Trip 落库在工具内同步完成**
   `prisma.trip.create` + `behaviorLog.append(TRIP_PLANNED)` 在同一工具调用内完成，失败 → `{ success: false, error }` → synthesizer 降级文案。备选「SSE 后异步落库」失败难观测，已否决。

5. **目的地缺失 → `{ unresolved: true }`，不落库不产事件**
   单一 LLM 草稿调用同时产出 destination；destination 为空或 zod 解析失败 → unresolved → synthesizer 追问「想去哪儿玩呀？」，避免硬造行程（AC-5）。

6. **SSE `trip` 事件携带完整行程（非仅 ID）**
   前端零额外请求即可渲染卡片；事件一并落入 `ChatMessage.payload.events` 支持回放。数据量小（几天 × 每步 ≤6 字段），可接受；备选「仅 tripId + 前端回读端点」引入二期才需要的读取契约，已否决。

7. **`Trip` 模型存 `days` 而非日期范围**
   需求文档的「dates」收敛为 `days` 天数 + 每日 `itinerary` 分组，避免 LLM 做日历计算产生幻觉；具体日期语义二期再补（可空字段演进）。

8. **消息透传到 `planTripTool`**
   `dispatch` 增 `message?: string` 参数（`stateLoop` 已持有），工具从「消息 + 画像」提取上下文；不把 message 塞进 `PlannedCall`（保持意图形状最小）。

9. **前端本期无地图叠加**
   高德 JS API 需 referrer 配置 + 前端 key，依赖真实密钥环境；`TripTimeline` 先渲染行程卡片（目的地 + 天数分组 + POI 步骤 + 校验徽标 + 路线摘要）。地图二期（ARCHITECTURE 蓝图保留，§8 决策注明延期）。

10. **`BehaviorAction` 追加 `TRIP_PLANNED`**
    追加式枚举值（不动既有值）；payload `{ destination, days, tripId, validated }`，与 FU-3 的 payload 解析先例一致（行为日志页按 action 展示）。

## Risks / Trade-offs

- [LLM 行程草稿幻觉（不存在的 POI）] → Amap 校验兜底：命中才标 `validated: true` 并带坐标；未校验 POI 前端显示「待确认」徽标。
- [高德配额/限流/网络失败] → 降级路径（不校验不规划路线）+ `fetch` 超时 guard；真机验收无 key 走降级，有 key 可加验。
- [SSE 事件契约扩展] → 追加式 union 成员；旧前端忽略未知事件（现有 handler 仅匹配已知 event 名）。回放路径同步扩展 `dtoToMessage`。
- [Neon 冷启动] → `Trip` 写入为小表单行 + 日志，无聚合放大；连接串已有 `connect_timeout=15`。
- [意图误判] → 旅行关键词与 mood/scene/insight 顺序固定并有测试锁定；「想看治愈片顺便规划行程」这类混合意图按单意图假设（旅行优先）处理，接受边界。

## Migration Plan

- 新迁移 `add_trip_model`：建 `TripStatus` 枚举 + `trips` 表（`@@index([userId, createdAt])`）+ `BehaviorAction` 追加 `TRIP_PLANNED`。`pnpm --filter=@fairy/database migrate:dev` 后 `generate`。
- 回滚：drop `trips` 表与 `TripStatus` 枚举、还原 `BehaviorAction`、移除共享 schema 增补、移除 agent 链与前端接线——均不影响既有行为（纯追加）。
- 上线前同步更新 `API_CONTRACT.md`（SSE `trip` 事件 + `AMAP_SERVER_KEY` 可选标注）、`ARCHITECTURE.md`（§8 决策一行 + 地图延期注记）、`docs/tools.md`（planTripTool 条目）、`PROJECT_STATUS.md`。

## Open Questions

- 真机验收是否提供真实 `AMAP_SERVER_KEY`：无 key 走降级路径（AC-3/AC-6 按降级验收），有 key 可加验真实 POI 校验与路线。
- 二期 `Trip` 读取契约（REST `/api/trips`、历史列表、地图叠加）的优先级与形状，届时再走需求流程。

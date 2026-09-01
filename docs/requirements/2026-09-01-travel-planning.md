# FU-13 旅行规划（第一期：对话行程生成）

- 状态：approved（2026-09-01，用户批准，OpenSpec 轨）
- 日期：2026-09-01
- 负责人：Flores
- 前置：ARCHITECTURE.md 已含完整设计蓝图（§4.2 意图枚举 `plan_trip`、`planTripTool`/`amapClient` 职责、§5.x 流程）；API_CONTRACT 已列 `POST /api/trips` 为未来端点

## 背景 / 问题

旅行规划是自 MVP 起挂账的能力：`apps/api/src/services/amapClient.ts`、`apps/api/src/tools/planTripTool.ts`、`apps/api/src/controllers/tripController.ts` 均为 0 字节占位，`routes/trips.ts` 是未挂载的 9 行占位，前端 `TripTimeline.tsx` 是占位组件；agent 链（intent → plan → dispatch → synthesize）、共享契约、Prisma `Trip` 模型完全缺失。用户想「帮我规划周末去杭州玩」目前只能得到闲聊/推荐回复。

本期把旅行规划接入 chat：识别 `plan_trip` 意图 → 读取画像与消息 → LLM 生成行程草稿 → 高德 Web 服务 API 校验 POI 并规划路线 → 落库 `Trip` → SSE 输出行程事件 + 文本摘要 → 前端 `TripTimeline` 渲染行程卡片。

## 目标

1. 用户在 chat 中提出旅行规划请求，得到含目的地、天数、POI 行程表的回复与可渲染的行程事件。
2. 行程 POI 经高德服务端校验（防幻觉）；高德不可用时优雅降级（标注未校验），不暴露密钥/堆栈。
3. `Trip` 落库（关联 userId），为后续二期（REST `/api/trips`、地图渲染、历史行程回放）打底。
4. 复用画像 `travelStyle` 个性化行程风格。

## 范围

- **数据库（packages/database）**：新增 `Trip` 模型（userId、destination、dates、itinerary JSON、route JSON、status、createdAt）+ 迁移。
- **共享（packages/shared）**：新增 `tripSchemas`/`tripTypes`（Trip、ItineraryStep、Poi、Route、`chatEventSchema` 增补 `trip` 事件 shape）+ 导出 + 测试。
- **后端（apps/api）**：
  - `services/amapClient.ts`：封装高德 Web 服务 API（POI 文本搜索 + 路线规划），读 `AMAP_SERVER_KEY`，可选启用（无 key 时降级）。
  - `tools/planTripTool.ts`：读画像 + 解析目的地/天数 → LLM 生成行程草稿（新 usage source `agent.trip`）→ amapClient 校验 POI/路线 → 落库 Trip → 行为日志（`TRIP_PLANNED`）→ `{ success, data, error }`。
  - agent 链：`intentClassifier` 新增 `plan_trip`（LLM 枚举 + 提示词 + 规则兜底：旅行/出游/行程/去X玩/周末去哪等）；`planner` 映射 `{ tool: "trip" }`；`toolDispatcher` 新增 `kind: "trip"` observation；`responseSynthesizer` trip 分支（行程摘要回复 + 兜底模板）；`routes/chat.ts` SSE 输出 `trip` 事件。
  - 测试：amapClient（mock fetch）、planTripTool（LLM mock + amap mock + 落库断言）、intent/planner/dispatcher/synthesizer/chat 集成。
- **前端（apps/web）**：`TripTimeline.tsx` 真实实现（渲染行程卡片：天数分组 + POI 步骤 + 路线说明），ChatPage 事件渲染接线，i18n；测试。
- **文档**：`API_CONTRACT.md`（SSE `trip` 事件 + `Trip` 行形状）、`ARCHITECTURE.md`（§5 流程/映射）、`docs/tools.md`（planTripTool 条目）、`PROJECT_STATUS.md`。

## 非目标

- 不做 REST `POST /api/trips` 与独立 trips 页面（二期；API_CONTRACT 未来端点清单不变）。
- 不做前端地图渲染（Amap JS API 叠加路线为二期；本期行程卡片无地图）。
- 不做酒店/机票/多城市串联/费用估算。
- 不做行程编辑/取消/历史列表（Trip 落库仅为回放打底，本期无读取端点）。
- 不新增行程推荐画像字段（仅读取现有 `travelStyle`）。

## 受影响模块

- `packages/database`（Trip 模型 + 迁移）
- `packages/shared`（tripSchemas/tripTypes + chatEventSchema 增补 + 导出 + 测试）
- `apps/api`（amapClient、planTripTool、agent 四件套、routes/chat、services/behaviorLogService 枚举 + 测试）
- `apps/web`（TripTimeline + ChatPage 接线 + i18n + 测试）
- 文档：API_CONTRACT、ARCHITECTURE、docs/tools.md、PROJECT_STATUS

## 验收标准

- AC-1：`帮我规划周末去杭州的行程` 识别为 `plan_trip`（LLM 或规则），不误判 recommend/chitchat。
- AC-2：行程回复含目的地、天数、POI 步骤列表（名称/城市/类别）；SSE 输出 `trip` 事件且 shape 符合 `chatEventSchema`。
- AC-3：POI 经 amapClient 校验（单测断言调用 + 结果替换草稿 POI 坐标）；amap 不可用时降级为未校验草稿并标注。
- AC-4：Trip 落库成功（userId 关联、itinerary/route JSON 可回读），行为日志记录 `TRIP_PLANNED`。
- AC-5：缺少目的地/信息不足时友好追问（如「想去哪里玩呀？」），不硬造行程。
- AC-6：`AMAP_SERVER_KEY` 缺失时服务不崩（启动不强制校验，planTripTool 跳过校验降级）。
- AC-7：测试全绿（api/shared/web 新增 + 回归）+ 三包 typecheck。
- AC-8：真机验收：chat 提问得到行程卡片与文本回复；SSE `done` 正常；无密钥/堆栈泄露。

## 待决问题

- **轨道选择**：跨 web+api+shared+db + 公共 SSE 契约变更 → 建议 **OpenSpec 轨**，待确认。
- **AMAP_SERVER_KEY 是否启动必填**：建议**可选**（缺失时降级），避免无 key 环境（CI/测试）启动失败；.env.example 已登记。
- **行程生成方式**：LLM 生成 POI 草稿再经 Amap 校验（防幻觉，推荐）vs 直接用 Amap 搜索（牺牲自由度）。
- **Trip 落库时点**：工具内同步落库（事务简单）vs SSE 后异步（失败难观测）——建议工具内同步。
- **SSE trip 事件与文本关系**：事件携带完整行程（前端渲染卡片）、文本为摘要（推荐），vs 事件仅 ID。

# FU-8 一键归还 UI（含 rentals 查询端点）

**Date:** 2026-08-29
**Status:** draft（待 grill-me 收敛——本文为拆分占位，实施前需走一轮 grill-me 确认细节）
**Complexity:** moderate

## Goal

为 FU-4 已落地的归还能力补上 UI 入口：用户在 chat 页看到「我的借阅」并可一键归还；推荐卡片对已借影片把「借阅」按钮切换为「归还」。**依赖 FU-4 核心已交付**（`rentalService.returnRental`、SSE `return` 事件、`RETURN_SUCCESS` 枚举）。

## Background

- 从 FU-4 拆分而来（用户 2026-08-29 拍板）：按钮对 FU-4 核心是单向依赖，拆出后核心 diff 减半且 web 零改动；按钮本质是租借状态展示，排 **FU-6（REST borrow）之后**实施，届时「chat 还 + REST 借」语义稳定，状态切换 UI 一次写对。
- 拆分时确认的边界：归还的库存变更仍只走 chat 工具链（架构 §8 双写禁令）——按钮提交的是**结构化 chat 请求**，不是新的 REST 写接口。

## Scope（拆分时冻结的范围，grill-me 时复核）

- **`GET /api/rentals`**：本人或 admin（对标 profiles 单条读鉴权），可选 `?status=ACTIVE`，`createdAt` 倒序，行含影片标题解析；挂 scaffold 遗留的 `rentalsRouter` 占位。
- **chat 请求 `action` 参数**：`chatRequestSchema` 增 `action?: z.enum(["return"])`；`{ movieId, action: "return" }` 为一键归还的确定性路径（`stateLoop` 直达工具，不经 LLM——同「一键借阅」movieId 直传模式）。
- **chat 页**：顶部「我的借阅」条（片名 chip + 归还按钮，点击发 `{ message: "", movieId, action: "return" }`）；`chatStore` 存 `activeRentals`，挂载时与每次 SSE `done` 后 refetch；`RecommendationCard` 当影片在ACTIVE 集合内时「借阅」按钮替换为「归还」。
- **SSE `return` 事件前端消费**：`useSSE`/`chatApi.parseSseBuffer` 处理 `return` 事件（归还后即时刷新借阅条与卡片态）。
- 测试：rentals 路由（本人 200/他人 403/admin 代查）、chat 确定性路径、web 双入口渲染与请求。

## Out of Scope

- REST `POST /api/returns`（保持 chat 单一写路径）；逾期/罚金/提醒；管理端代还；copy-level 跟踪

## Key Decisions（继承自 FU-4 拆分讨论）

| Decision | Choice | Rationale |
|---|---|---|
| 归还提交路径 | chat `{ movieId, action: "return" }` | 双写禁令；与一键借阅同模式 |
| 借阅状态来源 | `GET /api/rentals` 而非 SSE 附带 | 页面首屏就要有状态；本地记账刷新即丢 |
| 实施时点 | FU-6 之后 | 借/还语义齐备后一次写对状态切换 UI |

## Affected Modules

- `Fairy/apps/api`：rentals 路由（占位转正）、chat 路由（action 参数）、`__tests__/`
- `Fairy/apps/web`：chatApi、ChatPage、RecommendationCard、chatStore、useSSE、i18n、`__tests__/`
- `API_CONTRACT.md`（rentals 端点 + chat action 参数）

## Next Step

- [ ] grill-me 收敛（实施前）
- [ ] `/opsx:propose` → approve → apply

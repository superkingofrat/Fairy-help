## Why

借了还不能还：`Rental` 模型自 Phase 2 就备好了 `ACTIVE|RETURNED` 状态与复合索引，但没有任何归还路径——库存只减不增，租借只增不闭。grill-me 需求已批准（`docs/requirements/2026-08-29-fu-4-return-rentals.md`）；用户拍板**拆分**：本轮只做聊天文本归还，一键归还按钮 + `GET /api/rentals` 拆至 FU-8（占位需求已建），因此 **web 零改动**。

## What Changes

- `rentalService.returnRental(userId, movieId)`：事务内 findFirst `ACTIVE` 租借（命中复合索引）→ 无则新错误码 `RENTAL_NOT_FOUND` → 置 `RETURNED` → 库存 `increment: 1`（借出减过 1，回补必然安全）；新增 `listActiveRentals(userId)` 供 unresolved 回复列出现有借阅。
- `returnMovieTool` 镜像 `borrowMovieTool`；BehaviorLog 新增 `RETURN_SUCCESS` 动作（`BehaviorAction` 枚举迁移 `add_return_success_action`，仅成功记日志）。
- agent 链新增 return 意图：LLM 结构化 JSON `intent:"return"+movieTitle`（经既有 title-match 解析）；规则 fallback 追加「消息含『还』且唯一片名匹配」分支（hái/huán 歧义双保险）；`synthesize` 新增归还分支，unresolved 回复列出当前 ACTIVE 借阅片名。
- SSE 新增 `return` 事件（`{ success, remainingStock, rentalId, code }`，与 `borrow` 同型）；chat 请求体不变；**web 零改动**（`useSSE` 对未知事件静默忽略，回复文本走 `text` 事件）。
- 同步 `API_CONTRACT.md`（§3.7 return 事件与意图顺序、错误码 `RENTAL_NOT_FOUND`）、`ARCHITECTURE.md`（归还数据流）；Apply 完成后 archive 并更新 `PROJECT_STATUS.md`。

## Capabilities

### New Capabilities

- （无。归还归属既有 `movie-rental`，意图/事件归属既有 `agent-chat`，日志归属既有 `behavior-log`。）

### Modified Capabilities

- `movie-rental`: 新增归还事务需求（闭租借、回补库存、`RENTAL_NOT_FOUND` 幂等安全）；借阅侧不变。
- `agent-chat`: 规则分类链插入 return 分支（「还」+唯一片名）；新增 return 意图与 `return` SSE 事件需求（含 unresolved 列出借阅）。
- `behavior-log`: 写入需求扩展——成功归还追加 `RETURN_SUCCESS` 行。

## Impact

- 代码：`Fairy/packages/shared`（rentalTypes/chatTypes/behaviorLogSchemas）、`Fairy/packages/database`（枚举 + 1 迁移）、`Fairy/apps/api`（rentalService、returnMovieTool、agent 三件套、chat 路由、测试）
- **`Fairy/apps/web` 零改动**；chat 请求体不变；SSE 事件名新增 `return`（增量，不破坏既有事件）
- 新增环境变量：无；新错误码：`RENTAL_NOT_FOUND`
- 需求来源：`docs/requirements/2026-08-29-fu-4-return-rentals.md`；拆分占位：`docs/requirements/2026-08-29-fu-8-return-button-ui.md`

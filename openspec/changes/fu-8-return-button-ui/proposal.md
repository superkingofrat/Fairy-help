## Why

FU-4 把归还做成只有聊天文本入口，用户必须打字「还 X」；拆出的一键归还按钮（FU-8）依赖的借还语义在 FU-6（REST borrow）后已稳定。当前 `rentalsRouter` 仍是未挂载的占位，web 端没有「我的借阅」状态视图，推荐卡片也不知道哪些影片已借。grill-me 需求已批准（`docs/requirements/2026-08-29-fu-8-return-button-ui.md`，2026-09-01 收敛四项决策）。

## What Changes

- 挂载 `GET /api/rentals`（Bearer 必需）：本人看自己全部借阅（`createdAt` 倒序，`?status=ACTIVE` 过滤），admin 可 `?userId=<uuid>` 代查；行含影片标题解析、`returnedAt`；404 `USER_NOT_FOUND` / 400 `INVALID_USER_ID` / 403 / 401；不分页。
- chat 请求新增 `action?: z.enum(["return"])`（shared `chatRequestSchema`）：**严格联合校验**——action 存在必须带 movieId，否则 400 `VALIDATION_ERROR`；`{ message: "", movieId, action: "return" }` 为一键归还确定性路径，`stateLoop` 直达 `returnMovieTool`（不经 LLM），message 忽略。
- chat 页「我的借阅」条：顶部常驻、空态整条隐藏、chip + 归还按钮（pending 禁点）；`chatStore` 存 `activeRentals`，挂载与每次 SSE `done` 后 refetch；SSE `return` success 乐观移除 chip，failure 走聊天流内 text 事件 + refetch 校正。
- `RecommendationCard` 增 `isBorrowed`：已借影片「借阅」按钮切换为「归还」（不受 `stock < 1` 禁用），归还成功恢复「借阅」。
- 测试：rentals 路由鉴权/过滤/代查矩阵、chat action 确定性路径、shared 联合校验、web 双入口渲染与请求体断言。

## Capabilities

### New Capabilities

- （无。借阅/归还能力已存在于 `movie-rental`。）

### Modified Capabilities

- `movie-rental`: 增加「借阅状态可查询」（`GET /api/rentals`，本人/admin 代查、标题解析、状态过滤）与「一键归还走确定性路径」（chat `action:"return"` 直达工具、严格校验）两条行为需求；既有的借/还事务与 SSE `return` 事件语义不变。

## Impact

- 代码：`Fairy/apps/api`（rentals 路由占位转正、chat 路由 action 参数、`stateLoop` action 直通分支、测试）、`Fairy/apps/web`（chatApi、ChatPage、RecommendationCard、chatStore、useSSE、i18n、测试）、`Fairy/packages/shared`（`chatRequestSchema` 联合校验）
- 不改 Prisma schema / 迁移；不调用 `@fairy/ai-sdk`（确定性路径不经 LLM）
- 新增错误码：无（复用 `USER_NOT_FOUND`/`INVALID_USER_ID`/`VALIDATION_ERROR`）
- 契约文档：`API_CONTRACT.md`（新增 rentals 端点、chat action 参数）、`ARCHITECTURE.md`（§5.2/§8 双入口标注补 rentals 读口）
- 需求来源：`docs/requirements/2026-08-29-fu-8-return-button-ui.md`；Trellis 任务 `09-01-fu-8-return-button-ui`

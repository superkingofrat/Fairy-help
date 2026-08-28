# Spec — Phase 2 Agent 推荐与借阅

Normative behavior for Apply. Requirements source: `docs/requirements/2026-08-21-phase2-agent-recommend-borrow.md`.

## 1. Identity

- Chat and borrow use `res.locals.userId` from existing dev stub.
- Seed `User.id` **must equal** `authMiddleware` 的 `DEV_USER_ID`：`00000000-0000-4000-8000-000000000001`。
- 建议 seed 同时写入 `DEV_ADMIN_ID`（`...0002`），便于影片管理与聊天用户分离。
- 本阶段不引入 `role: agent`；`dev-user` 即代理人说话人。Admin 不在本阶段使用 `/chat` 代他人借片。

## 2. Prisma

### Profile

对齐 `API_CONTRACT.md` Profile 字段：`userId`（PK/FK → User）、`name`、`avatarUrl`、`styleTags[]`、`likeGenres[]`、`avoidFood[]`、`dietPreference`、`travelStyle`、时间戳。一对一 User。

### Rental

- `id`、`userId`、`movieId`、`status`（至少 `ACTIVE`；预留 `RETURNED` 供 FU-4，本阶段不写入 RETURNED 流程）
- `createdAt`、`updatedAt`
- 同一用户 + 同一影片 + `ACTIVE` 唯一（支持 `ALREADY_BORROWED`）

### BehaviorLog

- `id`、`userId`、`action`（字符串或枚举：`RECOMMEND`、`BORROW_SUCCESS`、`BORROW_OUT_OF_STOCK` 等）、`movieId?`、`rentalId?`、`payload`（可选 Json）、`createdAt`
- 只追加；无查询路由

### Session

- **禁止**本阶段建表

## 3. POST /api/chat

**Auth:** 与 `/api/movies` 相同 stub。未认证策略与现网电影读接口一致（当前中间件缺头时默认 `user`）。

**Request JSON**（Zod in `packages/shared`）:

```ts
{
  message: string;       // 可为空串当仅 movieId 借阅
  movieId?: string;      // UUID，一键借阅
  sessionId?: string;    // 可选，服务端忽略持久化
}
```

**Success:** `Content-Type: text/event-stream`。

SSE `event` 名：

| event | data | When |
|---|---|---|
| `text` | `{ "content": string }` | 模板回复；可多次 |
| `recommendation` | `{ "items": MovieCard[] }` | 仅推荐成功且 `items.length >= 1` |
| `borrow` | `{ "success": boolean, "remainingStock": number \| null, "rentalId": string \| null, "code": string }` | 借阅路径结束 |
| `done` | `{}` | 流正常结束 |

`MovieCard` 使用与 Movie 列表相同的公开字段（至少 `id,title,director,year,mood,scene,genres,quote,stock,coverUrl,description`）。

**非流错误**（401/400 等）仍为 `{ code, data, msg }` JSON。校验失败：`400` / `VALIDATION_ERROR`。

**禁止**挂载可用的 `POST /api/borrow`。

## 4. Rule agent

Keep files: `intentClassifier` → `planner` → `toolDispatcher` → `responseSynthesizer`，`stateLoop` 驱动。本阶段全部规则/模板，**不得** import 供应商客户端或调用 `@fairy/ai-sdk` 的 `chat`/`stream`。

Intent 优先级：

1. `movieId` 合法 UUID → `borrow_movie`（忽略书名解析）
2. 否则 `message` 匹配借阅（如含「借」且能抽出片名）→ `borrow_movie`（标题模糊：trim、包含匹配 `Movie.title`，大小写不敏感；0 或 >1 命中视为失败，只 `text`，不调扣库存）
3. 否则 `message` 含子串等于共享枚举 `MOODS` / `SCENES` 任一（至少一枚）→ `recommend_movie`
4. 否则 `unmatched`：只 `text` 引导，不调工具，不写 BehaviorLog

`recommend_movie`：解析出的 mood/scene 传给工具（未提到的维不强制）。过滤 `stock > 0` 且标签交集非空。`likeGenres` 与影片 `genres` 交集越多越靠前；同分可按 title。最多 **5** 条。0 条：只 `text` 致歉，不发 `recommendation`。

`borrow_movie`：`RentalService` 单事务：

- 影片不存在 → 失败码 `MOVIE_NOT_FOUND`（SSE `borrow.success=false`）
- `stock < 1` → `OUT_OF_STOCK`，写 BehaviorLog 失败条
- 已有 ACTIVE 同片 → `ALREADY_BORROWED`，不改 stock
- 否则 `UPDATE movie SET stock = stock - 1 WHERE id = ? AND stock > 0`，插入 ACTIVE Rental；0 行更新则当超卖/`OUT_OF_STOCK`
- 成功写 BehaviorLog；推荐成功写 `RECOMMEND`

`unmatched` 文案须提示可说心情/场景或点卡片借阅。i18n 在前端展示用户可见字符串；服务端模板可用中文常量并在 web 再映一层，或 API 只推 key、前端 t()——**面向用户的 UI 文案必须走 `locales/`**。SSE `text.content` 允许后端中文模板（对话气泡内容），卡片按钮等 chrome 走 i18n。

## 5. Tools & services

- `recommendMovieTool` / `borrowMovieTool`：`{ success, data, error }`；经 `ProfileService.getByUserId`（无画像不抛，降级纯标签）。
- `RentalService.borrow` 为唯一库存写入点（工具调用它；无 REST 第二入口）。
- `BehaviorLogService.append` 只追加。

## 6. Web

- 路由 `/chat`；导航链接；`ChatPage` 使用 `useSSE` 解析上述事件。
- `RecommendationCard`：展示片名/心情/库存；按钮触发带 `movieId` 的 chat POST。
- 请求带 `X-Dev-Role: user` 或 `Bearer dev-user`（与 Phase 1 管理端对称）。
- 加载/错误/空列表显式处理。

## 7. Tests

- API：规则意图（推荐/借阅/无匹配）；借阅事务与 `ALREADY_BORROWED`/`OUT_OF_STOCK`（测试库或事务回滚，禁止打开发库）；SSE 至少断言 event 名与 `recommendation`/`borrow` JSON。Mock 掉任何 LLM（本阶段应无调用）。
- Web：ChatPage 渲染与借阅按钮发出含 `movieId` 的 body（mock fetch/SSE）。
- Shared：chat Zod schema。

## 8. Docs (during Apply)

- `API_CONTRACT.md`：新增 § chat SSE；§3.7 borrow 移到「未来端点」；错误码表保留 `OUT_OF_STOCK`、`ALREADY_BORROWED` 供 SSE `borrow.code` 使用。
- `ARCHITECTURE.md`：注明 Phase 2 分类器/合成器为规则实现；Session 表未落地；借阅不经 REST。
- 需求文档 Next Step 勾选提案已创建。
- `PROJECT_STATUS.md` Completed 仅在 **Archive** 时勾，Apply 期间保持 In Progress。

# FU-15 记忆管理面设计

## 背景

FU-14 落库的 `Memory` 行（profileId = Profile.userId = User.id）目前不可见不可管。本期补 admin 管理面：REST 四端点 + `/admin/memories` 页。全部沿用既有模式——FU-1 `/api/profiles`（admin CRUD + controller 薄路由）、FU-3 `/api/behavior-logs`（分页 + 筛选 + `total` + join email）、FU-11 `/admin/*` 页（`RequireAuth role="admin"` + 三态 + i18n）、movie DELETE（`200 {code:"OK", data:{id}}`）。

## 方案

### 数据访问（`memory/memoryService` 扩展）

`Memory.profileId` 直接等于 User.id（Profile 以 userId 为主键），故列表 join 一次即可带 email：

```ts
listMemories(query: { page, limit, userId?, kind?, keyword? })
  where = { profileId: query.userId?, kind: KIND_TO_PRISMA[query.kind]?, content: keyword ? { contains: keyword } : undefined }
  [items, total] = prisma.$transaction([
    prisma.memory.findMany({ where, include: { profile: { include: { user: { select: { email: true } } } } },
      orderBy: { createdAt: "desc" }, skip: (page-1)*limit, take: limit }),
    prisma.memory.count({ where }),
  ])
  items → MemoryListItem { id, userId: profileId, email, kind: 小写, content, sessionId, createdAt }
```

- kind 过滤：shared kind 为小写，DB 为枚举大写——复用 FU-14 `KIND_TO_PRISMA` 映射（移入共享或 memoryService 内部导出）。
- keyword 为 content 包含匹配（与 `searchMemories` 同语义），避免幻影分页可不做（FU-3 同款取舍）。
- `createMemory`：先校验 `Profile` 存在（`userId` 即 `Profile.userId`），不存在 → 404 `PROFILE_NOT_FOUND`；存在 → `prisma.memory.create`（`profileId: userId`，kind 映射大写），复用返回形状。
- `updateMemory`：`prisma.memory.update`（kind/content 至少一项，已由 schema `refine` 保证）→ 404 空结果转 `MEMORY_NOT_FOUND`。
- `deleteMemory`：`deleteMany({ where: { id } })` → count 0 转 404；否则 `{ id }`。
- 不改变 `searchMemories`/`addMemory` 签名与 FU-14 语义（列表/管理是新路径，抽取注入是旧路径，共用表）。

### REST 契约（新 `routes/memories.ts`，全部 `requireRole("admin")`）

| 方法 | 路径 | Body/Query | 成功 | 错误 |
|---|---|---|---|---|
| GET | `/api/memories` | query: page=1 limit=20 userId? kind? keyword? | 200 `{code:"OK", data:{items, pagination}}` | 401 / 403 `FORBIDDEN` / 400 `VALIDATION_ERROR` |
| POST | `/api/memories` | `{ userId, kind, content, sessionId? }` | 201 `{code:"OK", data: MemoryRecord}` | 400 / 401 / 403 / 404 `PROFILE_NOT_FOUND` |
| PATCH | `/api/memories/:id` | `{ kind?, content? }`（至少一项） | 200 `{code:"OK", data: MemoryRecord}` | 400 / 401 / 403 / 404 `MEMORY_NOT_FOUND` |
| DELETE | `/api/memories/:id` | — | 200 `{code:"OK", data:{id}}` | 401 / 403 / 404 `MEMORY_NOT_FOUND` |

- 401/403 由 `authMiddleware` + `requireRole("admin")` 统一产出（403 code 为 `FORBIDDEN`，与 behavior-logs/insights 等 admin 路由一致）。
- query 校验 `validateQuery(memoryQuerySchema)`；body 校验 `validateBody`；路由处理器薄，逻辑在 memoryService。
- `app.ts` 挂载 `router`（`/api/memories`）。

### 前端（`/admin/memories`）

- `api/memoryApi.ts`：`listMemories(query)/createMemory(body)/updateMemory(id, body)/deleteMemory(id)`，复用 `lib/http.ts` 统一鉴权客户端（与 profileApi/behaviorApi 一致）。
- `AdminMemoryPage`：列表表（用户 email、kind 中文徽标、content、session、时间）；筛选条（kind 下拉 + keyword 搜索 + 提交）+ 分页（复用 FU-11 分页样式约定）；「新增记忆」按钮开弹窗（userId/kind/content）；行内「编辑」（同弹窗复用，PATCH）与「删除」（confirm 后 DELETE，成功移除行）；加载/错误/空态齐全；新增/编辑成功后重新拉列表。
- 路由 + 导航：`/admin/memories` 挂 `RequireAuth role="admin"`；管理导航加「记忆管理」项。
- i18n：全部面向用户文案进 `zh-CN.json`（keys 跟随 `admin.memory.*`）。

### 测试

- shared：`memorySchemas.test.ts` 扩展——query 默认值与非法 kind；listItem 形状；create/update refine（update 空 body 拒绝）。
- api：`memoryService.test.ts` 扩展（list 分页/过滤/email join/total；create Profile 不存在 404；update/delete 404）；新增 `__tests__/memoriesRoutes.test.ts`（admin 200 全链路、user 403、无 token 401、POST/PATCH/DELETE 错误码）。
- web：`AdminMemoryPage.test.tsx`（渲染 + 交互 + 三态 + 权限守卫）。
- 全程 mock Prisma/HTTP；无真实 LLM。

## 决策

| # | 决策 | 理由 |
|---|---|---|
| 1 | admin-only（REST + UI 均 `role=admin`） | 用户拍板；沿 FU-1/FU-3 管理面模式；用户自查二期再议 |
| 2 | 不含 pgvector/embedding | 用户拍板推后单独一期；DeepSeek 不支持 embed，向量化绑定 OpenAI key 环境 |
| 3 | DELETE 硬删，`200 {code:"OK", data:{id}}` | `Memory` 无外键引用；沿用 movie DELETE envelope |
| 4 | POST 允许 admin 手动补录 | 补录行与 LLM 抽取行同表，天然进入 FU-14 检索注入路径 |
| 5 | 复用 `memoryService`/`KIND_TO_PRISMA`，不新写第二套存储访问 | 避免管理面与抽取注入链路分叉 |

## 非目标（明确排除）

- pgvector 向量检索 / embedding 列；画像反向回写；用户侧自查入口；抽取频率与注入上限（≤5 条）变更；chat SSE 协议与 `chatEventSchema` 变更；`Memory` schema/迁移变更。

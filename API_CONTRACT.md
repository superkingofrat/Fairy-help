# Fairy — API 契约

**版本：** 1.0  
**基础 URL：** `http://localhost:3000/api`（开发环境）  
**媒体类型：** `application/json`

---

## 1. 通用约定

- 所有时间戳以 ISO 8601 格式返回（`YYYY-MM-DDTHH:mm:ssZ`）。
- 所有 API 响应遵循统一结构 `{ code, data, msg }`：
  - `code`：业务状态码。成功为 `"OK"`；失败为全大写蛇形（snake_case）错误码。
  - `data`：成功时为负载；出错时为 `null` 或附带上下文。
  - `msg`：人类可读的描述。
- 列表响应中，`data` 在适用情况下包含 `{ items, pagination }`。
- 错误响应也使用同样的 `{ code, data, msg }` 结构。
- 除标注 **Public** 的端点外，所有端点都需要认证。
- 认证头：`Authorization: Bearer <jwt>`。

---

## 2. 领域模型

### Movie（影片）

```ts
interface Movie {
  id: string;              // UUID
  title: string;
  director: string;
  year: number;
  mood: Mood[];            // 例如：["治愈", "热血"]
  scene: Scene[];          // 例如：["雨天", "失眠夜"]
  genres: string[];        // 例如：["科幻", "动作"]
  quote: string | null;    // Fairy 使用的经典台词
  stock: number;           // 当前可借数量
  totalStock: number;
  coverUrl: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
}
```

### Profile（用户画像）

```ts
interface Profile {
  userId: string;
  name: string;
  avatarUrl: string | null;
  styleTags: string[];     // 例如：["冒险家", "夜猫子"]
  likeGenres: string[];    // 例如：["科幻", "悬疑"]
  avoidFood: string[];     // 例如：["香菜", "海鲜"]
  dietPreference: string | null;
  travelStyle: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. 端点

### 3.0 认证（FU-5 / FU-10）

**POST** `/auth/login` — **Public**

请求体 `{ email, password }`；成功返回 `{ code, data: { token, refreshToken, user: { id, email, role } } }`。`token` 为 HS256 JWT（payload `{ userId, role }`，12h 过期）；`refreshToken` 为不透明随机令牌（30 天有效，仅可用于 `/auth/refresh`）。凭证错误（密码错/邮箱不存在）统一返回 401 `UNAUTHORIZED`，不区分原因。

**POST** `/auth/register` — **Public**（FU-10）

请求体 `{ email, password }`（password 6–72 字符）；密码 bcrypt(cost 10) 存储，注册用户角色恒为 `user`（admin 仅经 seed 创建，不开放注册）。注册成功即登录：201 `{ code, data: { token, refreshToken, user } }`，与 `/auth/login` 同形状。不自动创建 Profile。

**POST** `/auth/refresh` — **Public**（FU-10）

请求体 `{ refreshToken }`。校验通过后**旋转**：旧 token 立即失效（`revokedAt` + 记录 `replacedByTokenId`），返回新的一对 `{ code, data: { token, refreshToken, user } }`。**复用检测**：已吊销/已替换的 token 再次出现 → 401 `INVALID_REFRESH_TOKEN`，并吊销该用户全部 refresh token（强制重新登录）。过期/不存在的 token 同样 401。

**POST** `/auth/logout` — **Public**（FU-10）

请求体 `{ refreshToken }`；吊销该 token（幂等，未知 token 也返回 200）。access token 不做服务端吊销，自然过期。

**GET** `/auth/me` — 需认证

返回当前 token 对应的用户摘要 `{ id, email, role }`；token 无效/过期 → 401。

#### 限流（FU-10）

登录、注册与对话按 IP 限流（默认不信任代理，生产部署在反向代理后须启用 trust proxy）：

| 端点 | 窗口 | 上限 | 超限响应 |
|---|---|---|---|
| `POST /auth/login` | 15 分钟 | 10 次 | 429 `TOO_MANY_REQUESTS` |
| `POST /auth/register` | 1 小时 | 20 次 | 429 `TOO_MANY_REQUESTS` |
| `POST /chat` | 1 分钟 | 30 次 | 429 `TOO_MANY_REQUESTS` |

> `POST /chat` 限流（2026-09-20）先于 `authMiddleware` 生效——未认证的超额请求同样计限并返回 429；限额为运营约束而非契约承诺，可按真实用量调整（正常对话约 10–15 轮/分钟）。

#### 认证约定（FU-5 起）

- 除 `/health` 与 `/auth/login`、`/auth/register`、`/auth/refresh`、`/auth/logout` 外，所有端点都需要 `Authorization: Bearer <jwt>`。
- dev auth stub（`X-Dev-Role` 头 / `Bearer dev-<role>`）已**移除**，携带者一律 401。
- 角色语义不变：admin-only 端点对 user 角色 403 `FORBIDDEN`；chat 说话人 = token 中的 userId。

### 3.1 搜索影片

**GET** `/movies/search`

按心情、场景和/或关键词搜索录像带门店目录。

#### 查询参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `mood` | `string` | 否 | 以逗号分隔的心情标签。示例：`mood=治愈,热血` |
| `scene` | `string` | 否 | 以逗号分隔的场景标签。示例：`scene=雨天,失眠夜` |
| `keyword` | `string` | 否 | 对标题、导演、描述与台词进行模糊匹配。 |
| `page` | `number` | 否 | 页码，从 1 开始。默认：`1`。 |
| `limit` | `number` | 否 | 每页条数。默认：`10`，最大：`100`。 |

#### 校验规则

- `mood`、`scene`、`keyword` 三者必须至少提供一个。
- 未知的 mood/scene 值将被忽略。
- `limit` 被限制在 `1` 到 `100` 之间。

#### 请求示例

```http
GET /api/movies/search?mood=治愈,悬疑&scene=雨天&keyword=星际&page=1&limit=5
Authorization: Bearer <jwt>
```

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "星际穿越",
        "director": "Christopher Nolan",
        "year": 2014,
        "mood": ["治愈", "悬疑"],
        "scene": ["雨天", "失眠夜"],
        "genres": ["科幻", "冒险"],
        "quote": "我们曾经仰望星空，思考我们在宇宙中的位置。",
        "stock": 3,
        "totalStock": 5,
        "coverUrl": "https://cdn.example.com/covers/interstellar.jpg",
        "description": "地球末日临近，一队探险家穿越虫洞寻找新家园。",
        "createdAt": "2024-01-10T08:00:00Z",
        "updatedAt": "2024-08-01T12:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 5,
      "total": 12,
      "totalPages": 3
    }
  },
  "msg": "查询成功"
}
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `MISSING_SEARCH_CRITERIA` | 未提供 mood、scene 或 keyword。 |
| 401 | `UNAUTHORIZED` | 缺少或无效的 token。 |
| 500 | `INTERNAL_ERROR` | 意外的服务器错误。 |

---

### 3.2 影片列表

**GET** `/movies`

分页获取门店影片目录。

#### 查询参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `page` | `number` | 否 | 页码，从 1 开始。默认：`1`。 |
| `limit` | `number` | 否 | 每页条数。默认：`10`，最大：`100`。 |

#### 授权

- `user` 与 `admin` 均可读取。

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0,
      "totalPages": 0
    }
  },
  "msg": "查询成功"
}
```

---

### 3.3 获取影片详情

**GET** `/movies/:id`

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 404 | `MOVIE_NOT_FOUND` | 影片不存在。 |

---

### 3.4 创建影片

**POST** `/movies`

仅 `admin` 可创建。请求体由 `createMovieSchema` 校验。

#### 校验规则

- `mood`、`scene` 各 1–3 个标签。
- `totalStock` 必须大于等于 `stock`。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求体不合法。 |
| 403 | `FORBIDDEN` | 非 admin 调用。 |

---

### 3.5 更新影片

**PATCH** `/movies/:id`

仅 `admin` 可更新。请求体为 `updateMovieSchema` 的部分字段。

---

### 3.6 删除影片

**DELETE** `/movies/:id`

仅 `admin` 可删除。MVP 为硬删除。

---

### 3.7 智能体对话（SSE）

**POST** `/chat`

用户侧推荐与借阅的唯一入口。成功时返回 `text/event-stream`，不是一次 JSON `{ code, data, msg }`。校验失败仍返回 JSON 信封。

认证：需要 `Authorization: Bearer <jwt>`；未认证 401（JSON 信封，不开启流）。说话人身份 = token 中的 userId。

#### 请求体

```ts
{
  message: string;     // 可为空（仅 movieId 借阅 / action 归还时）
  movieId?: string;    // UUID，一键借阅或 action 归还
  action?: "return";   // FU-8：确定性归还，必须携带 movieId（否则 400）
  sessionId?: string;  // FU-7：可选；普通消息缺省时后端自动创建会话
}
```

`action: "return"` 与 `movieId` 必须同时出现；缺失其一返回 400 `VALIDATION_ERROR`。

会话行为（FU-7 起）：

- 携带 `sessionId`：必须是当前用户拥有的会话，否则在开启 SSE 前返回 JSON 错误（404 `SESSION_NOT_FOUND` / 403 `SESSION_FORBIDDEN`）。
- 普通消息缺省 `sessionId`：后端自动创建会话，标题由首条用户消息派生（trim 后前 20 字）。
- `action: "return"` 缺省 `sessionId`：不创建会话（归还无上下文写入）。

#### SSE 事件

| event | data |
|---|---|
| `text` | `{ content: string }` |
| `recommendation` | `{ items: Movie[] }`（仅有可借匹配时） |
| `borrow` | `{ success, remainingStock, rentalId, code }` |
| `return` | `{ success, remainingStock, rentalId, code }`（FU-4 起；归还成功/失败） |
| `trip` | `{ trip: TripResult }`（FU-13 起；行程规划成功时） |
| `done` | `{ sessionId: string \| null }`（FU-7 起；本次消息所属会话，未建会话时为 `null`） |

`borrow.code` 成功为 `OK`；失败为 `OUT_OF_STOCK`、`ALREADY_BORROWED`、`MOVIE_NOT_FOUND`。`return.code` 成功为 `OK`；失败为 `RENTAL_NOT_FOUND`。

`trip` 事件仅在行程规划成功时发出，`data` 为完整 `TripResult`（`tripId`、`destination`、`days`、`itinerary`——按天分组的 POI 步骤，每步含 `time`/`name`/`category`/`note`/`location`/`validated`、`route`——相邻已校验 POI 间的路线 `from`/`to`/`distanceMeters`/`durationSeconds`，无校验时为 `null`、`validated`）。行程规划对代理人「铃」（画像名 `铃`）与绳匠（admin）开放：其他身份请求时**不调用规划工具、不落库、不发出事件**，回复婉拒文本并引导推荐影片。目的地无法从消息确定时**不落库、不发出事件**，只返回追问文本；高德不可用（`AMAP_SERVER_KEY` 缺失/超时/报错）时 POI 标 `validated: false`、`route: null`，仍返回行程，且不暴露密钥、原始响应或堆栈（FU-13）。

意图顺序：合法 `movieId` → 手打「借」+ 唯一片名 → 手打「还」+ 唯一片名 → 消息含子串 mood/scene → 引导语（不调工具）。LLM 路径（FU-2 起）按结构化意图输出，规则链为降级路径；归还仅在用户明确表达归还影片时触发（「还」有 hái/huán 歧义）。

#### LLM 行为与降级（FU-2 起）

- `text` 事件内容默认由 LLM 生成（意图理解与回复合成），只引用工具观察事实与用户画像，不虚构业务数据。
- 未配置 `AI_PROVIDER`/key、供应商超时或报错时，自动降级为上述规则意图 + 模板回复；SSE 事件名与负载形状**不变**，本节契约在两种模式下均成立。
- 闲聊类输入（问候等）返回自然回复，不产生 `recommendation`/`borrow` 事件。

#### 记忆中心（FU-14 起，内部行为说明——无公共契约变更）

- 每轮对话 SSE 完成后，服务端后台从本轮（用户消息 + Fairy 回复）抽取值得记住的偏好/事实/意图并落库 `Memory`（按 `profileId` 用户隔离，`sessionId` 可空）；抽取失败静默跳过，对响应零影响。
- 下一轮回复合成 prompt 注入该用户记忆（≤5 条）与近期会话历史；记忆不跨用户泄漏、不改变 SSE 事件形状。
- FU-16 起对话注入为**混合检索**：以用户当前消息为语义查询，配置 `EMBEDDING_API_KEY`（缺省回退 `OPENAI_API_KEY`）且行含向量时按 cosine 相似度召回（`kind`/`keyword` 可预过滤、不足 5 条按时间倒序补齐）；无 key/embed 故障/行无向量时自动退回结构化检索——**默认 dev（DeepSeek、无 OpenAI key）行为与 FU-14 一致**。embedding 属内部增强：`memories.embedding`（pgvector，1536 维）由 raw SQL 读写、**永不下发**，本契约无任何字段新增。
- 记忆的查看与维护经 admin-only REST `/api/memories`（FU-15 起，见 §3.14）与管理页 `/admin/memories`；FU-17 起登录用户可在会话页经 `GET /api/memories/me`（§3.14.1）自查本人记忆（只读）。管理端点不依赖 LLM；FU-16 起配置 embed key 时 `POST /api/memories`（admin 新增）会实时生成向量，`EMBEDDING_API_KEY` 未配置时管理面行为不变。
- FU-18 起抽取在 `memories` 之外同轮产出顶层 `genres`（片型候选 ≤3，属内部中间结果，不进 SSE 流、不下发任何端点）；本轮 ≥1 条 preference 记忆**成功落库**且候选非空时，服务端以影片库 `Movie.genres` distinct 词表白名单过滤后增量并入该用户 `Profile.likeGenres`（事务内并集去重、只增不减、无变化不写、失败静默）。全链路为**内部旁路，无公共契约变更**：不新增端点、不改请求/响应形状，FU-1 `PATCH /api/profiles` 手动维护 likeGenres 的契约与行为不变。

#### 错误响应（非流）

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求体不合法（如 `movieId` 不是 UUID）。 |
| 403 | `SESSION_FORBIDDEN` | `sessionId` 属于其他用户（FU-7 起）。 |
| 404 | `SESSION_NOT_FOUND` | `sessionId` 不存在（FU-7 起）。 |

借阅可经本端点调度工具，也可直接调用 REST `POST /borrow`（§3.10）；归还仅经本端点的 `action: "return"` 调度（无 REST 归还写端点）。

---

### 3.8 画像资源 `/api/profiles`

画像 REST 资源为复数形式。历史单数路径 `GET /api/profile/:userId` 已废弃且从未实现，不得调用。

#### 认证

- `Authorization: Bearer <jwt>`（登录获取，见 §3.0）。
- 列表、创建、更新仅 `admin`；单条读取为本人或 `admin`。

#### 3.8.1 列表（按用户展开）

**GET** `/profiles`

每个已有 `User` 一行；`profile` 为完整画像文档（形状见 §2）或 `null`。本端点无分页。

```http
GET /api/profiles
Authorization: Bearer <jwt>
```

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": [
    {
      "userId": "660e8400-e29b-41d4-a716-446655440001",
      "email": "user@fairy.local",
      "role": "user",
      "profile": {
        "userId": "660e8400-e29b-41d4-a716-446655440001",
        "name": "铃",
        "avatarUrl": null,
        "styleTags": ["夜猫子"],
        "likeGenres": ["科幻", "悬疑"],
        "avoidFood": [],
        "dietPreference": null,
        "travelStyle": null,
        "createdAt": "2024-01-15T10:20:00Z",
        "updatedAt": "2024-08-05T18:45:00Z"
      }
    },
    {
      "userId": "660e8400-e29b-41d4-a716-446655440002",
      "email": "admin@fairy.local",
      "role": "admin",
      "profile": null
    }
  ],
  "msg": "查询成功"
}
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 403 | `FORBIDDEN` | 非 admin 调用。 |

#### 3.8.2 读取单条

**GET** `/profiles/:userId`

成功时 `data` 为 Profile 文档（形状见 §2）。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `INVALID_USER_ID` | `userId` 不是 UUID。 |
| 403 | `FORBIDDEN` | 调用方既非所有者也非 admin。 |
| 404 | `PROFILE_NOT_FOUND` | 该用户不存在画像。 |

#### 3.8.3 创建（补建）

**POST** `/profiles`

仅 admin，为**已有且尚无画像**的 User 创建，不创建新 User。请求体：

```ts
{
  userId: string;                // 目标用户 UUID
  name: string;                  // 必填非空
  avatarUrl: string | null;      // 空串按 null 存储
  styleTags: string[];           // 自由字符串，可为空数组
  likeGenres: string[];
  avoidFood: string[];
  dietPreference: string | null;
  travelStyle: string | null;
}
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求体不合法。 |
| 404 | `USER_NOT_FOUND` | 目标用户不存在。 |
| 409 | `PROFILE_ALREADY_EXISTS` | 该用户已有画像。 |

成功响应 — 201 Created，`data` 为新建 Profile 文档。

#### 3.8.4 更新

**PATCH** `/profiles/:userId`

仅 admin，部分更新画像字段；`userId` 不可修改；本资源不提供 DELETE。更新为单次原子写入。请求体为上述可写字段的任意子集（不含 `userId`）。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` / `INVALID_USER_ID` | 请求体不合法 / `userId` 不是 UUID。 |
| 403 | `FORBIDDEN` | 非 admin 调用。 |
| 404 | `PROFILE_NOT_FOUND` | 画像不存在。 |

成功响应 — 200 OK，`data` 为更新后的 Profile 文档。

#### 3.8.5 写后联动

PATCH `likeGenres` 后，`recommendMovieTool` 在下一次 `/api/chat` 调用时即按新偏好（与影片 `genres` 精确相交）排序，无需其他刷新动作。

---

### 3.9 行为流水（FU-3）

**GET** `/behavior-logs`

BehaviorLog 的只读分页流水，仅 `admin` 可调用；append-only，**不提供**任何修改/删除端点。行按 `createdAt` 倒序。

#### 查询参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `page` | `number` | 否 | 页码，从 1 开始。默认：`1`。 |
| `limit` | `number` | 否 | 每页条数。默认：`20`，最大：`100`。 |
| `action` | `string` | 否 | 动作枚举：`RECOMMEND`、`BORROW_SUCCESS`、`BORROW_OUT_OF_STOCK`、`RETURN_SUCCESS`、`TRIP_PLANNED`、`TRIP_UNRESOLVED`、`TRIP_DRAFT_FAILED`、`TRIP_PERSIST_FAILED`。 |
| `userId` | `string` | 否 | 按用户 UUID 过滤。 |

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": {
    "items": [
      {
        "id": "990e8400-e29b-41d4-a716-446655440000",
        "userId": "00000000-0000-4000-8000-000000000001",
        "email": "user@fairy.local",
        "action": "BORROW_SUCCESS",
        "movieId": "550e8400-e29b-41d4-a716-446655440000",
        "movieTitle": "星际穿越",
        "rentalId": "880e8400-e29b-41d4-a716-446655440000",
        "recommendCount": null,
        "createdAt": "2026-08-29T08:00:00Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  },
  "msg": "查询成功"
}
```

`movieTitle` 由 `movieId` 服务端解析；`recommendCount` 仅 `RECOMMEND` 行有值（推荐片单长度），原始 `payload` 不下发。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 查询参数不合法（含未知 `action`）。 |
| 400 | `INVALID_USER_ID` | `userId` 不是 UUID。 |
| 403 | `FORBIDDEN` | 非 admin 调用。 |

---

### 3.10 REST 借阅（FU-6）

**POST** `/borrow` — 需认证（Bearer）

登录用户直接借片；借阅人 = token subject（请求体**不含** userId）。与 chat 借阅共用同一事务与日志。

#### 请求体

```json
{ "movieId": "550e8400-e29b-41d4-a716-446655440000" }
```

#### 成功响应 — 201 Created

```json
{
  "code": "OK",
  "data": { "rentalId": "880e8400-e29b-41d4-a716-446655440000", "remainingStock": 2 },
  "msg": "借阅成功"
}
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `movieId` 不是 UUID。 |
| 401 | `UNAUTHORIZED` | 未认证。 |
| 404 | `MOVIE_NOT_FOUND` | 影片不存在。 |
| 409 | `ALREADY_BORROWED` | 已有进行中的同片租借。 |
| 409 | `OUT_OF_STOCK` | 库存不足。 |

---

### 3.11 借阅列表（FU-8）

**GET** `/rentals` — 需认证（Bearer）

返回租借记录，按借出时间倒序。默认查当前登录用户；admin 可携带 `userId` 代查。

#### 查询参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `status` | `"ACTIVE"`（可选） | 仅返回进行中（未归还）的租借。 |
| `userId` | UUID（可选，仅 admin） | 代查指定用户的租借记录；非 admin 携带则 403。 |

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": [
    {
      "rentalId": "880e8400-e29b-41d4-a716-446655440000",
      "movieId": "550e8400-e29b-41d4-a716-446655440000",
      "movieTitle": "星际穿越",
      "status": "ACTIVE",
      "borrowedAt": "2026-08-29T08:00:00.000Z",
      "returnedAt": null
    }
  ],
  "msg": "查询成功"
}
```

`status` 取值：`ACTIVE`（进行中）、`RETURNED`（已归还）。`returnedAt` 仅已归还记录非空。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `status` 取值非法。 |
| 400 | `INVALID_USER_ID` | `userId` 不是合法 UUID。 |
| 401 | `UNAUTHORIZED` | 未认证。 |

---

### 3.12 会话资源 `/api/sessions`（FU-7）

会话与对话历史回放的 REST 资源。所有端点需认证（Bearer）；数据归属为 token 中的 `userId`。

#### 3.12.1 创建会话

**POST** `/sessions`

```http
POST /api/sessions
Authorization: Bearer <jwt>
```

请求体为空。新建会话标题为空字符串，标题在第一条消息落库时派生。

#### 成功响应 — 201 Created

```json
{
  "code": "OK",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "",
    "messageCount": 0,
    "createdAt": "2026-09-01T08:00:00.000Z",
    "updatedAt": "2026-09-01T08:00:00.000Z"
  },
  "msg": "会话已创建"
}
```

#### 3.12.2 会话列表

**GET** `/sessions`

按 `updatedAt` 倒序返回当前用户的会话。

```http
GET /api/sessions
Authorization: Bearer <jwt>
```

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "雨天",
      "messageCount": 3,
      "createdAt": "2026-09-01T08:00:00.000Z",
      "updatedAt": "2026-09-01T09:00:00.000Z"
    }
  ],
  "msg": "查询成功"
}
```

#### 3.12.3 读取会话消息

**GET** `/sessions/:id`

按 `createdAt` 升序返回该会话的完整消息历史。

```http
GET /api/sessions/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <jwt>
```

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "user",
      "content": "雨天想看点什么",
      "payload": null,
      "createdAt": "2026-09-01T08:05:00.000Z"
    },
    {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "assistant",
      "content": "为你找到这些片子",
      "payload": {
        "events": [
          { "type": "recommendation", "items": [] }
        ]
      },
      "createdAt": "2026-09-01T08:05:01.000Z"
    }
  ],
  "msg": "查询成功"
}
```

`role` 取值 `user` / `assistant`。`payload` 为消息附带的结构化事件（当前仅 `recommendation` 卡片），无事件时为 `null`。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `:id` 不是合法 UUID。 |
| 401 | `UNAUTHORIZED` | 未认证。 |
| 403 | `SESSION_FORBIDDEN` | 会话属于其他用户。 |
| 404 | `SESSION_NOT_FOUND` | 会话不存在。 |


---

### 3.13 运营洞察 `/api/insights`（FU-11）

admin-only 只读聚合接口，一次返回运营看板全部卡片数据。需认证（Bearer）且角色为 admin；user 角色 → 403 `FORBIDDEN`，无 token → 401 `UNAUTHORIZED`。

#### 3.13.1 运营看板概览

**GET** `/insights/overview`

```http
GET /api/insights/overview
Authorization: Bearer <jwt>
```

聚合窗口与阈值均为契约常量：借阅趋势最近 14 天（缺日补 0）、mood/scene 分布最近 30 天、活跃用户/新增注册最近 7 天、热门影片 TOP 5；低库存阈值为 `stock ≤ 1`。

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": {
    "popularMovies": [
      {
        "movieId": "550e8400-e29b-41d4-a716-446655440000",
        "title": "海蒂",
        "borrowCount": 12,
        "recommendCount": 5,
        "inStock": true
      }
    ],
    "trend": [
      { "date": "2026-08-19", "borrowCount": 3, "returnCount": 1 }
    ],
    "inventory": {
      "activeRentals": 7,
      "borrowedRatio": 0.35,
      "lowStockMovies": [
        {
          "movieId": "550e8400-e29b-41d4-a716-446655440001",
          "title": "楚门的世界",
          "stock": 0,
          "totalStock": 2
        }
      ]
    },
    "moods": [{ "value": "治愈", "count": 8 }],
    "scenes": [{ "value": "雨天", "count": 6 }],
    "activity": { "totalUsers": 3, "activeUsers7d": 2, "newUsers7d": 1 }
  },
  "msg": "查询成功"
}
```

字段说明：

- `popularMovies`：按借阅次数（`Rental` 按 `movieId` 分组）降序 TOP 5；`recommendCount` 来自 RECOMMEND 行为日志 `payload.movieIds` 累计；`inStock` = `stock > 0`。
- `trend`：最近 14 天逐日借出（`Rental.createdAt`）与归还（`status=RETURNED` 的 `updatedAt`）计数，缺失日期补 0；`date` 为 `yyyy-mm-dd`（服务器本地日期分桶）。
- `inventory`：`activeRentals` 为当前 ACTIVE 借出数；`borrowedRatio` = 借出 / 总库存（0–1）；`lowStockMovies` 为 `stock ≤ 1` 的影片（按库存升序）。
- `moods` / `scenes`：近 30 天被借影片的标签计数 TOP 5，仅含有数据的维度；无数据显示空数组。
- `activity`：`totalUsers` 用户总数、`activeUsers7d` 近 7 天有行为日志的 distinct userId 数、`newUsers7d` 近 7 天注册数。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 401 | `UNAUTHORIZED` | 未认证或 token 无效。 |
| 403 | `FORBIDDEN` | 非 admin 角色。 |

---

### 3.14 记忆管理 `/api/memories`（FU-15）

Memory 的 admin 管理面 REST 资源。需认证（Bearer）且角色为 admin；user 角色 → 403 `FORBIDDEN`，无 token → 401 `UNAUTHORIZED`。手动新增/编辑/删除的记忆与 FU-14 对话抽取的记忆同表同链路：一经落库即被既有检索（≤5 条注入）使用。管理端点不依赖 LLM；FU-16 起若配置 `EMBEDDING_API_KEY`，新增（POST）的记忆会附带实时生成向量（失败静默，仅日志），未配置时管理面行为与响应形状不变。抽取不可用不影响管理面。删除为硬删。本条不暴露任何 embedding 字段。FU-17 起 §3.14.1 提供**自查面** `GET /api/memories/me`（任意已登录角色只读本人记忆）；§3.14.2–3.14.5 仍为 admin-only。

#### 3.14.1 自查（本人只读）——GET `/api/memories/me`（FU-17）

登录用户查看**自己的**记忆（对应会话页「Fairy 记住了什么」面板）。身份由 Bearer token 决定，无需也不能指定他人 `userId`：请求中携带的 `userId`/`email` 等越权参数会被校验层直接剥离（视同不存在）。user 角色与 admin 角色均可调用；仅无 token → 401。

#### 查询参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `page` | `number` | 否 | 页码，从 1 开始。默认：`1`。 |
| `limit` | `number` | 否 | 每页条数。默认：`20`，最大：`100`。 |
| `kind` | `string` | 否 | 按类型过滤：`preference`、`fact`、`intent`。 |
| `keyword` | `string` | 否 | 匹配 `content` 包含，最长 100。 |

超出以上范围的查询参数一律忽略（zod 剥除未知键），不会改变过滤结果。

#### 成功响应 — 200 OK

条目形状与 §3.14.2 列表一致，但**不含** `userId`/`email`（本人身份即 token，无需回传），且**只返回** `profileId` == 当前用户的记录：

```json
{
  "code": "OK",
  "data": {
    "items": [
      {
        "id": "965d65a1-70df-443f-9a69-7e031968ac20",
        "kind": "preference",
        "content": "喜欢太空题材科幻片",
        "sessionId": null,
        "createdAt": "2026-09-06T13:53:42.634Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  },
  "msg": "查询成功"
}
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 查询参数不合法（含未知 `kind`）。 |
| 401 | `UNAUTHORIZED` | 未认证。 |

（不存在 403：本端点为任意已登录角色开放。）

#### 3.14.2 列表

**GET** `/api/memories`

分页列出全部用户记忆，行按 `createdAt` 倒序，条目带所属用户 `email`（经 `Memory.profileId → Profile → User` join；`userId` == `Memory.profileId`）。

#### 查询参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `page` | `number` | 否 | 页码，从 1 开始。默认：`1`。 |
| `limit` | `number` | 否 | 每页条数。默认：`20`，最大：`100`。 |
| `userId` | `string` | 否 | 按用户 UUID 过滤（`profileId`）。 |
| `kind` | `string` | 否 | 按类型过滤：`preference`、`fact`、`intent`。 |
| `keyword` | `string` | 否 | 匹配 `content` 包含，最长 100。 |

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": {
    "items": [
      {
        "id": "965d65a1-70df-443f-9a69-7e031968ac20",
        "userId": "00000000-0000-4000-8000-000000000001",
        "email": "user@fairy.local",
        "kind": "preference",
        "content": "喜欢太空题材科幻片",
        "sessionId": null,
        "createdAt": "2026-09-06T13:53:42.634Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  },
  "msg": "查询成功"
}
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 查询参数不合法（含未知 `kind`）。 |
| 401 | `UNAUTHORIZED` | 未认证。 |
| 403 | `FORBIDDEN` | 非 admin 角色。 |

#### 3.14.3 创建

**POST** `/api/memories`

admin 为指定用户手动补录记忆。请求体：

```ts
{
  userId: string;       // 目标用户 UUID（必须已有 Profile，否则 404）
  kind: "preference" | "fact" | "intent";
  content: string;      // 1–2000 字
  sessionId?: string;   // 可选来源会话
}
```

#### 成功响应 — 201 Created

`data` 为落库后的 Memory 记录（`id`/`profileId`/`sessionId`/`kind`/`content`/`metadata`/`createdAt`，`profileId` 即传入的 `userId`）。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求体不合法（非法 `kind`、空 `content`、`userId` 非 UUID）。 |
| 401 | `UNAUTHORIZED` | 未认证。 |
| 403 | `FORBIDDEN` | 非 admin 角色。 |
| 404 | `PROFILE_NOT_FOUND` | 目标用户不存在画像。 |

#### 3.14.4 更新

**PATCH** `/api/memories/:id`

admin 部分更新记忆的 `kind` 与/或 `content`（至少一项，`sessionId` 不可改）。

#### 成功响应 — 200 OK

`data` 为更新后的 Memory 记录。

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求体不合法或空（未提供任何字段）。 |
| 401 | `UNAUTHORIZED` | 未认证。 |
| 403 | `FORBIDDEN` | 非 admin 角色。 |
| 404 | `MEMORY_NOT_FOUND` | 记忆不存在。 |

#### 3.14.5 删除

**DELETE** `/api/memories/:id`

admin 硬删一条记忆（`Memory` 无外键引用，物理删除即可）。行删除后列表与对话注入检索均不再出现。

#### 成功响应 — 200 OK

```json
{ "code": "OK", "data": { "id": "965d65a1-70df-443f-9a69-7e031968ac20" }, "msg": "删除成功" }
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 401 | `UNAUTHORIZED` | 未认证。 |
| 403 | `FORBIDDEN` | 非 admin 角色。 |
| 404 | `MEMORY_NOT_FOUND` | 记忆不存在（含重复删除）。 |

---

## 4. 错误码参考

| Code | HTTP 状态 | 含义 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 缺少或无效的认证信息。 |
| `VALIDATION_ERROR` | 400 | 请求体或查询参数校验失败。 |
| `FORBIDDEN` | 403 | 权限不足。 |
| `INVALID_USER_ID` | 400 | `userId` 格式错误。 |
| `INVALID_MOVIE_ID` | 400 | `movieId` 格式错误。 |
| `MISSING_SEARCH_CRITERIA` | 400 | 搜索请求缺少过滤条件。 |
| `MOVIE_NOT_FOUND` | 404 | 目标影片缺失。 |
| `PROFILE_NOT_FOUND` | 404 | 目标画像缺失。 |
| `USER_NOT_FOUND` | 404 | 目标用户缺失（画像补建时）。 |
| `PROFILE_ALREADY_EXISTS` | 409 | 该用户已有画像（补建冲突）。 |
| `OUT_OF_STOCK` | SSE `borrow` / `POST /borrow` | 影片无法借阅。 |
| `ALREADY_BORROWED` | SSE `borrow` / `POST /borrow` | 存在重复的进行中租赁。 |
| `RENTAL_NOT_FOUND` | SSE `return` | 该用户没有进行中的这笔借阅（未借先还/重复归还）。 |
| `SESSION_NOT_FOUND` | 404 | 会话不存在（FU-7 起）。 |
| `SESSION_FORBIDDEN` | 403 | 会话属于其他用户（FU-7 起）。 |
| `MEMORY_NOT_FOUND` | 404 | 记忆不存在（FU-15 管理面起）。 |
| `EMAIL_ALREADY_EXISTS` | 409 | 注册邮箱已存在（FU-10 起）。 |
| `INVALID_REFRESH_TOKEN` | 401 | refresh token 无效/过期/已吊销（FU-10 起）。 |
| `TOO_MANY_REQUESTS` | 429 | 登录、注册或对话频率超限（FU-10 起；`POST /chat` 自 2026-09-20 起 30 次/分钟）。 |
| `INTERNAL_ERROR` | 500 | 未处理的服务器错误。 |

---

## 5. 未来端点

以下端点为后续版本规划，暂不属于本契约：

- `POST /api/trips` — 旅行规划。
- `GET /api/admin/insights` — 运营看板数据。

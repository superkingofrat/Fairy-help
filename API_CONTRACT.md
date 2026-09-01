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

### 3.0 认证（FU-5）

**POST** `/auth/login` — **Public**

请求体 `{ email, password }`；成功返回 `{ code, data: { token, user: { id, email, role } } }`。`token` 为 HS256 JWT（payload `{ userId, role }`，12h 过期）。凭证错误（密码错/邮箱不存在）统一返回 401 `UNAUTHORIZED`，不区分原因。

**GET** `/auth/me` — 需认证

返回当前 token 对应的用户摘要 `{ id, email, role }`；token 无效/过期 → 401。

#### 认证约定（FU-5 起）

- 除 `/health` 与 `/auth/login` 外，所有端点都需要 `Authorization: Bearer <jwt>`。
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
  sessionId?: string;  // 可选；本阶段不落库
}
```

`action: "return"` 与 `movieId` 必须同时出现；缺失其一返回 400 `VALIDATION_ERROR`。

#### SSE 事件

| event | data |
|---|---|
| `text` | `{ content: string }` |
| `recommendation` | `{ items: Movie[] }`（仅有可借匹配时） |
| `borrow` | `{ success, remainingStock, rentalId, code }` |
| `return` | `{ success, remainingStock, rentalId, code }`（FU-4 起；归还成功/失败） |
| `done` | `{}` |

`borrow.code` 成功为 `OK`；失败为 `OUT_OF_STOCK`、`ALREADY_BORROWED`、`MOVIE_NOT_FOUND`。`return.code` 成功为 `OK`；失败为 `RENTAL_NOT_FOUND`。

意图顺序：合法 `movieId` → 手打「借」+ 唯一片名 → 手打「还」+ 唯一片名 → 消息含子串 mood/scene → 引导语（不调工具）。LLM 路径（FU-2 起）按结构化意图输出，规则链为降级路径；归还仅在用户明确表达归还影片时触发（「还」有 hái/huán 歧义）。

#### LLM 行为与降级（FU-2 起）

- `text` 事件内容默认由 LLM 生成（意图理解与回复合成），只引用工具观察事实与用户画像，不虚构业务数据。
- 未配置 `AI_PROVIDER`/key、供应商超时或报错时，自动降级为上述规则意图 + 模板回复；SSE 事件名与负载形状**不变**，本节契约在两种模式下均成立。
- 闲聊类输入（问候等）返回自然回复，不产生 `recommendation`/`borrow` 事件。

#### 错误响应（非流）

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求体不合法（如 `movieId` 不是 UUID）。 |

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
| `action` | `string` | 否 | 动作枚举：`RECOMMEND`、`BORROW_SUCCESS`、`BORROW_OUT_OF_STOCK`。 |
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
| 403 | `FORBIDDEN` | 非 admin 携带 `userId` 代查。 |
| 404 | `USER_NOT_FOUND` | 代查的 `userId` 不存在。 |

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
| `INTERNAL_ERROR` | 500 | 未处理的服务器错误。 |

---

## 5. 未来端点

以下端点为后续版本规划，暂不属于本契约：

- `POST /api/trips` — 旅行规划。
- `GET /api/admin/insights` — 运营看板数据。

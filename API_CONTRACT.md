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

#### 开发环境认证

开发阶段可使用以下任一方式：

- 请求头：`X-Dev-Role: user` 或 `X-Dev-Role: admin`
- 请求头：`Authorization: Bearer dev-user` 或 `Authorization: Bearer dev-admin`

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

### 3.7 执行借阅

**POST** `/borrow`

为用户借阅一部影片。扣减库存并创建租赁记录。

#### 请求体

```ts
{
  movieId: string;  // UUID
  userId: string;   // UUID
}
```

#### 响应结构

```ts
{
  code: "OK" | ErrorCode;
  data: {
    success: boolean;
    remainingStock: number;
    rentalId: string | null;
  } | null;
  msg: string;
}
```

#### 校验规则

- `movieId` 必须是合法的 UUID。
- `userId` 必须是合法的 UUID。
- 借阅人身份由请求 token 决定。除非调用方具有 admin 角色，否则传入的 `userId` 必须与认证用户一致。

#### 请求示例

```http
POST /api/borrow
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "movieId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "660e8400-e29b-41d4-a716-446655440001"
}
```

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": {
    "success": true,
    "remainingStock": 2,
    "rentalId": "770e8400-e29b-41d4-a716-446655440002"
  },
  "msg": "借阅成功，愿这段旅程治愈你。"
}
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `INVALID_MOVIE_ID` | `movieId` 缺失或不是 UUID。 |
| 400 | `INVALID_USER_ID` | `userId` 缺失或不是 UUID。 |
| 403 | `FORBIDDEN` | `userId` 与认证用户不一致，且调用方不是 admin。 |
| 404 | `MOVIE_NOT_FOUND` | 影片不存在。 |
| 409 | `OUT_OF_STOCK` | 影片库存为零。 |
| 409 | `ALREADY_BORROWED` | 用户对该影片已有进行中的租赁。 |
| 500 | `INTERNAL_ERROR` | 事务失败或意外错误。 |

#### 错误示例 — 409 Conflict

```json
{
  "code": "OUT_OF_STOCK",
  "data": {
    "movieId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "msg": "该影片暂时缺货，Fairy 会记住你的偏好，到货后提醒你。"
}
```

---

### 3.8 获取用户画像

**GET** `/profile/:userId`

获取用户的个人画像，Fairy 用它来个性化推荐与旅行规划。

#### 路径参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `userId` | `string` | 是 | 目标用户的 UUID。 |

#### 授权

- 用户可以读取自己的画像。
- admin 可以读取任意画像。

#### 请求示例

```http
GET /api/profile/660e8400-e29b-41d4-a716-446655440001
Authorization: Bearer <jwt>
```

#### 成功响应 — 200 OK

```json
{
  "code": "OK",
  "data": {
    "userId": "660e8400-e29b-41d4-a716-446655440001",
    "name": "铃",
    "avatarUrl": "https://cdn.example.com/avatars/ling.jpg",
    "styleTags": ["冒险家", "夜猫子", "甜食控"],
    "likeGenres": ["科幻", "悬疑", "治愈"],
    "avoidFood": ["香菜", "海鲜"],
    "dietPreference": "偏爱甜食和面食",
    "travelStyle": "城市探索 + 轻度徒步",
    "createdAt": "2024-01-15T10:20:00Z",
    "updatedAt": "2024-08-05T18:45:00Z"
  },
  "msg": "查询成功"
}
```

#### 错误响应

| 状态 | Code | 场景 |
|---|---|---|
| 400 | `INVALID_USER_ID` | `userId` 不是 UUID。 |
| 401 | `UNAUTHORIZED` | 缺少或无效的 token。 |
| 403 | `FORBIDDEN` | 调用方既非所有者也非 admin。 |
| 404 | `PROFILE_NOT_FOUND` | 该用户不存在画像。 |
| 500 | `INTERNAL_ERROR` | 意外的服务器错误。 |

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
| `OUT_OF_STOCK` | 409 | 影片无法借阅。 |
| `ALREADY_BORROWED` | 409 | 存在重复的进行中租赁。 |
| `INTERNAL_ERROR` | 500 | 未处理的服务器错误。 |

---

## 5. 未来端点

以下端点为后续版本规划，暂不属于本契约：

- `POST /api/chat` — 智能体对话入口（SSE）。
- `POST /api/trips` — 旅行规划。
- `GET /api/admin/insights` — 运营看板数据。
- `PATCH /api/profile/:userId` — 更新个人画像。

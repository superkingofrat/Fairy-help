# Fairy — API Contract

**Version:** 1.0  
**Base URL:** `http://localhost:3000/api` (development)  
**Media Type:** `application/json`

---

## 1. General Conventions

- All timestamps are returned in ISO 8601 format (`YYYY-MM-DDTHH:mm:ssZ`).
- All API responses follow the unified shape `{ code, data, msg }`:
  - `code`: business status code. `"OK"` for success; uppercase snake-case error code for failures.
  - `data`: payload on success; `null` or additional context on error.
  - `msg`: human-readable description.
- For list responses, `data` contains `{ items, pagination }` where applicable.
- Error responses use the same `{ code, data, msg }` shape.
- Authentication is required for all endpoints unless marked **Public**.
- Auth header: `Authorization: Bearer <jwt>`.

---

## 2. Domain Models

### Movie

```ts
interface Movie {
  id: string;              // UUID
  title: string;
  director: string;
  year: number;
  mood: Mood[];            // e.g., ["治愈", "热血"]
  scene: Scene[];          // e.g., ["雨天", "失眠夜"]
  genres: string[];        // e.g., ["科幻", "动作"]
  quote: string | null;    // Classic line used by Fairy
  stock: number;           // Current available copies
  totalStock: number;
  coverUrl: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
}
```

### Profile

```ts
interface Profile {
  userId: string;
  name: string;
  avatarUrl: string | null;
  styleTags: string[];     // e.g., ["冒险家", "夜猫子"]
  likeGenres: string[];    // e.g., ["科幻", "悬疑"]
  avoidFood: string[];     // e.g., ["香菜", "海鲜"]
  dietPreference: string | null;
  travelStyle: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. Endpoints

### 3.1 Search Movies

**GET** `/movies/search`

Search the video store catalog by mood, scene, and/or keyword.

#### Query Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `mood` | `string` | No | Comma-separated mood tags. Example: `mood=治愈,热血` |
| `scene` | `string` | No | Comma-separated scene tags. Example: `scene=雨天,失眠夜` |
| `keyword` | `string` | No | Fuzzy match against title, director, description, and quote. |
| `page` | `number` | No | Page number, 1-based. Default: `1`. |
| `limit` | `number` | No | Items per page. Default: `10`, max: `100`. |

#### Validation Rules

- At least one of `mood`, `scene`, or `keyword` must be provided.
- Unknown mood/scene values are ignored.
- `limit` is clamped between `1` and `100`.

#### Request Example

```http
GET /api/movies/search?mood=治愈,悬疑&scene=雨天&keyword=星际&page=1&limit=5
Authorization: Bearer <jwt>
```

#### Success Response — 200 OK

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

#### Error Responses

| Status | Code | Scenario |
|---|---|---|
| 400 | `MISSING_SEARCH_CRITERIA` | No mood, scene, or keyword provided. |
| 401 | `UNAUTHORIZED` | Missing or invalid token. |
| 500 | `INTERNAL_ERROR` | Unexpected server error. |

---

### 3.2 Execute Borrow

**POST** `/borrow`

Borrow a movie for a user. Decrements inventory and creates a rental record.

#### Request Body

```ts
{
  movieId: string;  // UUID
  userId: string;   // UUID
}
```

#### Response Shape

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

#### Validation Rules

- `movieId` must be a valid UUID.
- `userId` must be a valid UUID.
- Borrower identity is resolved from the request token. The provided `userId` must match the authenticated user unless the caller has admin role.

#### Request Example

```http
POST /api/borrow
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "movieId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "660e8400-e29b-41d4-a716-446655440001"
}
```

#### Success Response — 200 OK

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

#### Error Responses

| Status | Code | Scenario |
|---|---|---|
| 400 | `INVALID_MOVIE_ID` | `movieId` is missing or not a UUID. |
| 400 | `INVALID_USER_ID` | `userId` is missing or not a UUID. |
| 403 | `FORBIDDEN` | `userId` does not match authenticated user and caller is not admin. |
| 404 | `MOVIE_NOT_FOUND` | Movie does not exist. |
| 409 | `OUT_OF_STOCK` | Movie stock is zero. |
| 409 | `ALREADY_BORROWED` | User already has an active rental for this movie. |
| 500 | `INTERNAL_ERROR` | Transaction failure or unexpected error. |

#### Error Example — 409 Conflict

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

### 3.3 Get Profile

**GET** `/profile/:userId`

Retrieve a user's persona profile, used by Fairy to personalize recommendations and travel planning.

#### Path Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `userId` | `string` | Yes | UUID of the target user. |

#### Authorization

- A user may read their own profile.
- Admins may read any profile.

#### Request Example

```http
GET /api/profile/660e8400-e29b-41d4-a716-446655440001
Authorization: Bearer <jwt>
```

#### Success Response — 200 OK

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

#### Error Responses

| Status | Code | Scenario |
|---|---|---|
| 400 | `INVALID_USER_ID` | `userId` is not a UUID. |
| 401 | `UNAUTHORIZED` | Missing or invalid token. |
| 403 | `FORBIDDEN` | Caller is not the owner and not admin. |
| 404 | `PROFILE_NOT_FOUND` | Profile does not exist for this user. |
| 500 | `INTERNAL_ERROR` | Unexpected server error. |

---

## 4. Error Code Reference

| Code | HTTP Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication. |
| `FORBIDDEN` | 403 | Insufficient permissions. |
| `INVALID_USER_ID` | 400 | `userId` format error. |
| `INVALID_MOVIE_ID` | 400 | `movieId` format error. |
| `MISSING_SEARCH_CRITERIA` | 400 | Search request lacks filters. |
| `MOVIE_NOT_FOUND` | 404 | Target movie missing. |
| `PROFILE_NOT_FOUND` | 404 | Target profile missing. |
| `OUT_OF_STOCK` | 409 | Movie cannot be borrowed. |
| `ALREADY_BORROWED` | 409 | Duplicate active rental. |
| `INTERNAL_ERROR` | 500 | Unhandled server error. |

---

## 5. Future Endpoints

Planned for later versions and not yet part of this contract:

- `POST /api/chat` — Agent conversation entry point (SSE).
- `POST /api/trips` — Travel planning.
- `GET /api/admin/insights` — Operational dashboard data.
- `PATCH /api/profile/:userId` — Update persona profile.
- `POST /api/movies` — Admin create movie.

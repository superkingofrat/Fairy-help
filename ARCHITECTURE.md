# Fairy — 架构规范

**版本：** 1.0  
**范围：** Fairy AI Agent + 录像带门店管理平台的前端、后端、数据层与 AI/Agent 编排。

---

## 0. 技术栈

| 分层 | 技术 |
|---|---|
| 包管理 / Workspace | pnpm + Turborepo |
| 前端框架 | React 18 + TypeScript 5 |
| 前端构建工具 | Vite 5 |
| 样式 | Tailwind CSS 3 |
| 前端状态管理 | Zustand 4 |
| 路由 | React Router 6 |
| 后端框架 | Node.js 20 + Express 4 |
| 后端开发运行时 | tsx |
| 数据库 | PostgreSQL 15+ |
| ORM | Prisma 5 |
| AI 供应商 | OpenAI + Anthropic Claude（经 `@fairy/ai-sdk` 统一） |
| 校验 | Zod |
| 测试 | Vitest 2 |
| Lint / 格式化 | ESLint + Prettier |
| 容器化（可选） | Docker |

---

## 1. 设计理念

Fairy 是一个由 LLM 驱动的智能体，通过一个闭环操作真实的业务系统：**意图理解 → 画像感知下的规划 → 工具调用 → 观察 → 响应生成**。架构围绕以下目标优化：

- 以流式、富有个性的对话作为主要交互界面。
- 对真实数据（库存、画像、历史）进行安全、可观测的工具执行。
- 通过统一的画像与记忆中心实现强个性化。
- 可验证的 AI 输出（例如，经真实地图 API 校验的旅行目的地）。

设计综合了三种被验证的模式：

| 参考架构 | 借鉴的核心思想 |
|---|---|
| **LangGraph** | 把有状态的智能体循环建模为显式的状态/迁移：分类 → 规划 → 调用工具 → 观察 → 回复。 |
| **Letta（MemGPT）** | 一个带受限工作上下文与持久长期记录的中心化记忆服务。 |
| **Vercel AI SDK / Anthropic workflows** | 声明式工具 schema、流式文本生成、workflow 风格的工具编排。 |

---

## 2. 逻辑架构分层

```
┌─────────────────────────────────────────────────────────────────────┐
│                         表现层（Presentation）                        │
│  React + TypeScript  •  SSE 流消费  •  CSS 头像  •  地图             │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ SSE / REST
┌──────────────────────────────────▼──────────────────────────────────┐
│                         API 网关层（API Gateway）                     │
│  Express  •  Auth 中间件  •  请求校验（Zod）  •  Router               │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                     智能体编排层（Agent Orchestration）               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   意图分类     │  │   规划器      │  │     工具调度器             │  │
│  │  Intent       │  │  Planner     │  │   Tool Dispatcher        │  │
│  │ Classifier    │  │              │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         │                 │                       │                 │
│         └─────────────────┼───────────────────────┘                 │
│                           ▼                                         │
│                  ┌─────────────────┐                                │
│                  │   状态循环        │                                │
│                  │  observe → reply │                                │
│                  └─────────────────┘                                │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                            工具层（Tool）                            │
│  影片推荐  •  租赁工具  •  旅行规划  •  门店洞察                      │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                     服务 / 数据层（Service / Data）                  │
│  画像服务  •  影片服务  •  租赁服务  •  地图客户端                    │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                         持久化层（Persistence）                      │
│  PostgreSQL  •  Prisma ORM  •  migrations  •  seeders                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 各层职责

### 3.1 表现层（`apps/web/`）

| 组件 | 职责 |
|---|---|
| `ChatPage` | 对话容器、SSE 连接生命周期、消息列表。 |
| `FairyAvatar` | CSS 动画角色头像，带表情状态。 |
| `MessageStream` | 逐字渲染经 SSE 到达的流式 token。 |
| `RecommendationCard` | 展示影片推荐，并支持一键借阅。 |
| `TripTimeline` | 展示生成的行程，叠加地图路线。 |
| `AdminDashboard` | 租赁统计与运营洞察。 |

规则：

- 前端永不持有业务事务逻辑。它只发送意图文本并渲染结果。
- 地图渲染**仅**使用客户端 **Amap JS API**。服务端 Amap 密钥保持私密。
- 所有面向用户的内容均来自本地化模块。

### 3.2 API 网关层（`apps/api/src/routes/`、`apps/api/src/middleware/`）

| 组件 | 职责 |
|---|---|
| `POST /api/chat` | 所有对话请求的入口。接收文本 + 会话上下文。 |
| `authMiddleware` | 校验 JWT/会话；附加 `userId` 与 `role`。 |
| `validateBody` | 使用 `packages/shared/` 的 Zod schema 校验请求形状。 |
| 领域路由（`/movies`、`/rentals`、`/trips`、`/profiles`） | 面向管理端 CRUD 与直接 UI 操作的 REST 端点。 |

规则：

- 所有聊天流量都经由 `/api/chat`。客户端不得直接调用工具。
- 领域路由面向管理/维护 UI，而非 agent 逻辑。
- 认证（FU-5 起）：`POST /api/auth/login` 签发 HS256 JWT（12h），`authMiddleware` 只认 `Authorization: Bearer` 并注入 `userId`/`role`；dev stub（`X-Dev-Role`/`Bearer dev-*`）已移除。`JWT_SECRET` 缺失时 API 拒绝启动。密码以 bcrypt 哈希存储。
- 账号闭环（FU-10 起）：`POST /api/auth/register` 自助注册（仅 `user` 角色，bcrypt cost 10）；`POST /api/auth/login` 与 `/register` 成功后随 access token 一并签发 **refresh token**（30 天，DB 只存 sha256 哈希），`POST /api/auth/refresh` 旋转（旧 token 置 `revokedAt` + `replacedByTokenId`，复用已吊销 token 触发该用户全部 refresh token 吊销），`POST /api/auth/logout` 吊销。登录/注册端点按 IP 限流（express-rate-limit，限流器在 `createApp()` 内创建）。

### 3.3 智能体编排层（`apps/api/src/agent/`）

这是 Fairy 的核心。它被建模为显式状态循环，而非单一提示词。

| 组件 | 职责 |
|---|---|
| `IntentClassifier` | 把用户输入映射到以下之一：`chat`、`recommend_movie`、`borrow_movie`、`plan_trip`、`store_insight`。 |
| `ContextBuilder` | 加载工作记忆：最近消息、用户画像、近期行为日志。 |
| `Planner` | 决定调用哪个（些）工具及其先后顺序。 |
| `ToolDispatcher` | 执行所选工具、捕获错误、返回观察结果。 |
| `ResponseSynthesizer` | 把观察结果转换成最终以 Fairy 人设流式输出的回复。 |
| `StateLoop` | 驱动 分类 → 规划 → 工具 → 观察 → 回复 循环，最大迭代次数受限。 |

规则：

- FU-2 起：`IntentClassifier` 与 `ResponseSynthesizer` 内部为 **LLM 实现**（经 `llmClient` 消费 `@fairy/ai-sdk`，意图为 zod 校验的结构化 JSON，回复只引用工具观察事实）；Phase 2 的规则/模板实现整体保留为 **fallback**——缺 key、超时或供应商报错时自动降级，SSE 事件名与负载形状不变。
- `llmClient` 是 agent 内唯一的 LLM 入口：缓存 provider 实例、清洗用户输入、把任何供应商失败折叠为 `null`（降级信号），并经 `usage.ts` 记录 token 用量。
- 循环在产出最终响应后，或达到 `MAX_AGENT_ITERATIONS` 后终止。
- 工具报错会作为观察结果返回给编排器，以便 Fairy 恢复或致歉。
- 任何 LLM 输出在通过时间敏感事实（库存、地图 POI）校验之前，不得持久化；工具执行永远不依赖 LLM 产出的 `movieId`（借片意图仅产片名，由 title-match 服务解析）。

### 3.4 工具层（`apps/api/src/tools/`）

每个工具都是自包含的函数，带一份严格的由 LLM 消费的 JSON schema。

| 工具 | 职责 |
|---|---|
| `recommendMovieTool` | 读取画像 + 心情/场景过滤条件，返回排序后的影片卡片。 |
| `borrowMovieTool` | 校验库存、扣减库存、写入租赁日志。 |
| `planTripTool` | 读取画像、请 LLM 生成行程草稿、用 Amap 校验 POI、计算路线。 |
| `storeInsightTool` | 聚合租赁/运营指标，并请 LLM 给出经营建议。 |

规则：

- 每个工具都会把自身调用与结果写入行为日志。
- 每个工具都返回确定性的结构：`{ success, data, error }`。
- 在 agent 流程中，工具是业务变更发生的**唯一**场所。

### 3.5 服务 / 数据层（`apps/api/src/services/`、`packages/database/`）

| 服务 | 职责 |
|---|---|
| `ProfileService` | 人设、偏好、厌恶项、旅行风格的 CRUD。 |
| `MovieService` | 影片目录与元数据；强制 `mood` 与 `scene` 标签。 |
| `RentalService` | 库存校验、借阅事务、归还处理。 |
| `BehaviorLogService` | 面向 agent 记忆的只追加活动日志。 |
| `AmapClient` | 服务端 POI 搜索与路线规划封装。 |
| `AiProviderClient` | 来自 `packages/ai-sdk/` 的统一 OpenAI/Claude 客户端。 |

规则：

- 服务不依赖 Express 或 HTTP 上下文。
- 数据库访问只通过 Prisma model 进行。

### 3.6 持久化层（`packages/database/`）

| 实体 | 用途 |
|---|---|
| `User` | 认证、角色（`admin`、`user`、`agent`）。 |
| `Profile` | 性格标签、影片偏好、旅行风格、饮食、厌恶项。 |
| `Movie` | 影片目录，含必需的 `mood[]` 与 `scene[]` 数组，以及台词片段。 |
| `Rental` | 关联用户与影片的借阅/归还记录。 |
| `Trip` | 生成的行程，含经校验的 POI 与路线。 |
| `BehaviorLog` | 只追加的分类账：谁、何时、什么动作、相关实体。 |
| `Session` | 面向短期记忆的轻量会话上下文（**Phase 2 未建表**；`sessionId` 不落库）。 |

规则：

- `mood` 与 `scene` 使用严格枚举。不允许自由格式字符串。
- 每个业务动作至少写入一条 `BehaviorLog` 记录。
- 长期记忆由 `Profile` + `BehaviorLog` 推导得出，而非通过堆砌提示词实现。

---

## 4. 工具调度设计

### 4.1 调度模型

Fairy 采用**单智能体顺序调度 + 确定性路由**（灵感来源于 LangGraph 状态迁移与 Vercel AI SDK 的 `streamText` + tools）：

1. **分类（Classify）** — `IntentClassifier` 选择目标领域。
2. **规划（Plan）** — `Planner` 选择工具序列。多数流程只用一个工具；旅行规划可能使用 `planTripTool`，其内部会调用地图 API。
3. **执行（Execute）** — `ToolDispatcher` 在需要时于事务内运行该工具。
4. **观察（Observe）** — 工具结果被追加到运行中的状态。
5. **合成（Synthesize）** — `ResponseSynthesizer` 流式输出最终回复。

### 4.2 工具定义 Schema

每个工具暴露一份兼容 OpenAI/Claude 函数调用的 schema：

```ts
interface Tool {
  name: string;
  description: string;           // 从模型的视角书写
  parameters: z.ZodObject<any>;  // 共享 Zod schema
  handler: (args: any, ctx: AgentContext) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### 4.3 工具调度流程

```
User message（用户消息）
    │
    ▼
IntentClassifier ──► Intent: recommend_movie
    │
    ▼
ContextBuilder 加载 profile + 近期日志
    │
    ▼
Planner 选择 recommendMovieTool
    │
    ▼
ToolDispatcher ──► recommendMovieTool
    │
    ▼
MovieService + ProfileService
    │
    ▼
ToolResult（sorted movies 排序影片）
    │
    ▼
ResponseSynthesizer 流式输出最终回复
```

### 4.4 错误处理

- 工具失败向编排器返回 `{ success: false, error }`。
- 对于瞬时外部错误（例如地图 API 超时），编排器可重试一次。
- 致命错误以友好文案流式返回给用户，细节在服务端记录日志。

---

## 5. 数据流

### 5.1 影片推荐流程

```
[Frontend] "心情不好"
    │
    ▼ SSE
[POST /api/chat]
    │
    ▼
[Agent Orchestrator 智能体编排器]
    │
    ├── IntentClassifier ──► recommend_movie
    ├── ContextBuilder   ──► 加载 profile、近期日志
    ├── Planner          ──► recommendMovieTool(mood: 致郁/治愈, profile)
    │
    ▼
[recommendMovieTool]
    │
    ├── ProfileService ──► 影片类型偏好
    ├── MovieService   ──► SELECT WHERE mood @> {致郁, 治愈} AND stock > 0
    └── BehaviorLogService ──► 记录推荐事件
    │
    ▼
[ToolResult] 影片卡片
    │
    ▼
[ResponseSynthesizer] 流式输出推荐回复 + 卡片
    │
    ▼ SSE
[Frontend] 渲染 MessageStream + RecommendationCard
```

### 5.2 借阅执行流程

```
[Frontend] 点击推荐卡片上的"一键借阅"
    │
    ▼ SSE POST /api/chat { movieId }
[POST /api/chat]
    │
    ▼
[Agent Orchestrator 智能体编排器]
    │
    ├── IntentClassifier ──► borrow_movie
    ├── Planner          ──► borrowMovieTool(movieId, userId)
    │
    ▼
[borrowMovieTool]
    │
    ├── RentalService ──► BEGIN TX
    │   ├── 校验 stock > 0
    │   ├── 扣减 stock
    │   ├── 插入 Rental 记录
    │   └── commit
    ├── MovieService   ──► 返回更新后的 stock
    └── BehaviorLogService ──► 记录借阅事件
    │
    ▼
[ToolResult] { success, rental, remainingStock }
    │
    ▼
[ResponseSynthesizer] 流式输出确认信息 + 更新后的卡片
```

> 双入口（FU-6 起）：`POST /api/borrow` REST 端点复用同一 `borrowMovieTool`（服务事务 + 日志），错误映射为 201/404/409。借阅逻辑唯一，chat 与 REST 只是两个传输口。
> 用户侧影片库页（FU-9 起）：`/movies` 浏览页（分页 + mood/scene/keyword 筛选）的借阅按钮直调 REST `POST /api/borrow`；已借标记来自 `GET /api/rentals?status=ACTIVE`；**归还仍只经 chat 工具链**（页面不提供归还按钮，双写禁令不变）。

### 5.3 旅行规划流程

```
[Frontend] "想去玩"  或  admin: "想和 XXX 去玩"
    │
    ▼ SSE
[POST /api/chat]
    │
    ▼
[Agent Orchestrator 智能体编排器]
    │
    ├── IntentClassifier ──► plan_trip
    ├── ContextBuilder   ──► 加载目标 profile
    ├── Planner          ──► planTripTool(city, profile)
    │
    ▼
[planTripTool]
    │
    ├── AiProviderClient ──► LLM 生成候选 POI
    ├── AmapClient       ──► 校验每个 POI 是否存在
    │   └── 若无效 ──► 请 LLM 重新生成或返回错误
    ├── AmapClient       ──► 校验有效 POI 之间的路线规划
    └── BehaviorLogService ──► 记录行程规划事件
    │
    ▼
[ToolResult] 校验后的行程 + 路线
    │
    ▼
[ResponseSynthesizer] 流式输出行程 + 地图数据
    │
    ▼ SSE
[Frontend] 渲染 TripTimeline + Amap JS 路线叠加
```

### 5.4 记忆 / 画像流程（FU-14 记忆中心一期 + FU-15 记忆管理面 + FU-16 pgvector 向量检索 + FU-17 自查面板 + FU-18 画像反向回写）

```
每轮对话（chat SSE 完成后）
    │
    ▼
[MemoryExtractor] LLM 抽取本轮（用户消息 + Fairy 回复）
    │  失败/超时/非法 JSON → 静默跳过（返回空数组，不中断响应）
    ▼
[MemoryService.addMemory] 落库 Memory（profileId 必填，sessionId 可空）
    │  落库后 [EmbeddingClient.embedContent] 生成 1536 维向量 → raw UPDATE 写回 embedding 列
    │  无 EMBEDDING key / embed 失败 / 维度不符 → 静默跳过（仅日志，记忆本体不丢）
    │  [FU-18 回写旁路] 本轮 ≥1 条 preference 记忆成功落库且抽取含 genres 候选 →
    │  [ProfileService.mergeLikeGenres] 白名单过滤后事务内并集去重并入 Profile.likeGenres
    │  （白名单 = Movie.genres distinct + 脏值过滤 + TTL 5min；只增不减、无变化不写、失败静默）
    ▼
下一轮对话 prompt 组装（ContextBuilder）
    ├── [MemoryService.searchMemories] 记忆注入 ≤5 条（profileId 隔离）
    │    混合检索：调用方带 query（用户当前消息）+ embed 可用 + 行含向量时，
    │    $queryRaw 按 cosine 距离升序取 top-N（kind/keyword 可预过滤）；
    │    向量不足 limit 按时间倒序补齐（排除已召回 id），无向量/无 embed 则走既有结构化路径
    ├── 最近 N 条 Session 消息（短期，sessionService）
    └── Profile 实体（长期，likeGenres 由 FU-18 回写增量沉淀）
    │
    ▼
[Prompt 上下文窗口] 受 token 预算约束
```

- 检索自 FU-16 起为**混合检索**：对话注入以用户当前消息为语义查询，向量相关度为主、结构化兜底/补齐；embedding 走可选配置 `EMBEDDING_API_KEY`（缺省回退 `OPENAI_API_KEY`）/`EMBEDDING_MODEL`（默认 `text-embedding-3-small`，1536 维），与聊天供应商解耦——`AI_PROVIDER=deepseek` 也能 embed。**无 key / embed 故障 / 维度不符 / 行缺向量 → 自动退回结构化检索**，默认 dev 环境（DeepSeek、无 OpenAI key）行为与 FU-14 完全一致。
- `memories.embedding` 为 `Unsupported("vector(1536)")` 列：Prisma client 不读写，向量写入/检索一律 raw SQL（`$executeRaw`/`$queryRaw`）；该列**永不下发**到任何 DTO/API 响应。存量行由幂等脚本一次性回填（`pnpm --filter=@fairy/database backfill:embeddings`，只补齐 `embedding IS NULL` 行，可重跑）。
- 记忆按 `profileId` 严格隔离（AGENTS §6）：`Memory.profileId` 关联 `Profile.userId`；结构化与向量查询均以 `profileId` 限定，A 用户记忆绝不注入 B 用户 prompt。
- 降级友好：抽取失败、embed/LLM 不可用、DB 异常时对话功能完全不受影响。
- **管理面（FU-15 记忆中心二期）**：admin 经 REST 端点或 `/admin/memories` 管理页查看、新增、编辑（kind/content）、删除记忆。手动写入复用 `memoryService`（与 FU-14 LLM 抽取**同库同链路**），一经落库即被下一轮 `searchMemories` 检索注入；配置 embed 时 admin 新增（`createMemory`）同样实时生成向量。列表按 `profileId` join `Profile→User` 带出 email，分页 + `userId/kind/keyword` 过滤。

```
FU-15 记忆管理面（admin-only）
    │
    ▼
GET/POST /api/memories · PATCH/DELETE /api/memories/:id   （全部 requireRole("admin")，403 FORBIDDEN）
    │  查询：分页 + userId/kind/keyword 过滤 + join 带 email；写入：memoryCreate/UpdateSchema 校验
    ▼
[MemoryService] listMemories / createMemory / updateMemory / deleteMemory
    │  硬删（Memory 无外键引用）；删除后列表与 searchMemories 均不再出现
    ▼
Web /admin/memories  ←→  lib/memoryApi（列表 + 筛选 + 分页 + 新增/编辑/删除）
```

- 管理面独立于 LLM：列表与增删改不调用任何 AI 供应商，LLM/key 不可用时管理功能全可用；仅既有抽取/注入语义不变。
- **自查面（FU-17 记忆中心四期）**：登录用户经 `GET /api/memories/me` 只读查看**本人**记忆（会话页「Fairy 记住了什么」面板，只读、无增删改）。身份由 token 决定（`res.locals.userId` == `Memory.profileId`，复用 `Profile.userId` 主键恒等式，零迁移）；越权参数（`userId`/`email`）在 shared Zod 校验层被剥离，不存在跨用户读取。条目不带 `email`/`userId`；`sessionId` 非空 → 前端标注「对话抽取」，为空（admin/种子录入）→「系统录入」。分页对齐 admin 列表（`page`/`limit`/`kind`/`keyword`）。

```
FU-17 自查面（任意已登录角色，只读）
    │
    ▼
GET /api/memories/me     （requireRole 之外的公共认证路由，非 admin 可用；无 token → 401）
    │  query：page/limit/kind/keyword（越权参数 userId/email 由 shared schema 剥除）
    ▼
[MemoryService.listOwnMemories]  where profileId = 当前用户（时间倒序分页，不 join email）
    ▼
Web 会话页 ChatPage 头部「Fairy 记住了什么」开关 → [MemorySelfPanel] 只读列表
    （kind 标签 + 来源标注 对话抽取/系统录入 + 时间；面板内无写操作）
```

- **画像反向回写（FU-18 记忆中心五期）**：FU-14 抽取 LLM 在既有 `memories` 之外产出顶层 `genres`（片型候选 ≤3，语义＝用户本轮明确表达的影片偏好）；`extractAndStoreMemories` 在本轮**至少 1 条 preference 记忆成功落库**且候选非空时，旁路调用 `ProfileService.mergeLikeGenres(profileId, candidates)`。候选以影片库 `Movie.genres` distinct 词表为**白名单**过滤（空串/纯数字脏值剔除；进程内 TTL 5 分钟缓存——新入库片型最长延迟 5 分钟后可被命中，不引分布式缓存）；命中者事务内 `Set` 并集增量并入 `Profile.likeGenres`——**只增不减**、无变化不写（幂等、不翻动 `updatedAt`）、profile 缺失静默跳过。LLM 不可用/白名单查询失败/回写抛错均只记日志，绝不阻塞对话与记忆落库（与 FU-14 静默降级同级）。**无新 REST 端点、无公共 API 契约变更**；FU-1 `PATCH /api/profiles` 手动维护路径不变，二者可在任意次序叠加（回写只并集、PATCH 可整体覆写）。

```
FU-18 画像反向回写（抽取旁路，无新端点）
    │
    ▼
extractAndStoreMemories：记忆全部落库后，storedPreference ≥ 1 且 genres 候选非空
    │
    ▼
[ProfileService.mergeLikeGenres]  ← loadGenreWhitelist（Movie.genres distinct + 空/纯数字过滤 + TTL 5min）
    │  accepted = 候选 ∩ 白名单（去重）；无命中 → 不进入事务
    │  $transaction 内：读 profile（缺失 → 静默跳过）→ Set 并集 → 无差异不写 / 有差异 update
    ▼
Profile.likeGenres 增量沉淀（只增不减）；下一轮对话经 ContextBuilder 的 Profile 实体注入生效
```

### 5.5 归还流程（FU-4）

```
用户消息「还 X」
    │
    ▼
IntentClassifier ──► Intent: return（LLM 结构化意图，或规则链「还」+唯一片名分支）
    │
    ▼
Planner ──► returnMovieTool
    │
    ▼
ToolDispatcher ──► rentalService.returnRental（事务：findFirst ACTIVE
    │               ── 无 → RENTAL_NOT_FOUND（库存/租借均不变）
    │               ── 有 → rental 置 RETURNED → 库存 increment 1）
    │
    ▼
BehaviorLog RETURN_SUCCESS（仅成功时）
    │
    ▼
ResponseSynthesizer ──► SSE `return` 事件 + `text` 回复
```

红线：归还与借阅共用「库存变更仅经 chat 工具链」约束；`RENTAL_NOT_FOUND` 为幂等安全（重复归还第二次即拒绝）。一键归还按钮（FU-8）复用本流程：chat 请求带 `action: "return"` + `movieId` 时绕过意图分类，直达 `returnMovieTool`，SSE 事件与合成回复形状不变。

### 5.6 会话持久化与历史回放（FU-7）

```
用户发送消息（无 sessionId）
    │
    ▼
POST /api/chat ── 会话解析（SSE 头之前，404/403 返回 JSON）
    │  ├─ 携带 sessionId → sessionService.getOwnedSession 校验归属
    │  └─ 普通消息缺省 → sessionService.createSession 自动建会话（标题为空）
    │
    ▼
getRecentMessages(userId, sessionId, 10) ── 最近 10 条（desc take 后 reverse 为升序）
    │
    ▼
buildConversationHistory ── 纯文本「用户：…/Fairy：…」注入 prompt 上下文
    │
    ▼
runChatTurn（原流程不变）
    │
    ▼
appendTurn（旁路事务，失败不中断 SSE）
    │  ├─ session.update：title = 现有值 || 首条非空用户消息前 20 字（顺带 touch updatedAt）
    │  ├─ chatMessage.create（USER，纯文本 content）
    │  └─ chatMessage.create（ASSISTANT，content + payload.events 结构化事件）
    │
    ▼
SSE：... → done { sessionId }
```

回放路径：`GET /api/sessions/:id` 按 `createdAt` 升序返回消息 DTO，前端 `dtoToMessage` 从 `payload.events` 的 `recommendation` 事件还原推荐卡片。

### 5.7 运营洞察聚合（FU-11）

```
/admin/insights 页面加载
    │
    ▼
insightApi.fetchInsightsOverview ── GET /api/insights/overview（Bearer + requireRole("admin")）
    │
    ▼
insightService.getStoreInsightsOverview ── 11 个查询 Promise.all 并行（规避 Neon 冷启动串行延迟）
    │  ├─ rental.groupBy(movieId) ── 热门影片 TOP 5（借阅次数降序）
    │  ├─ behaviorLog.findMany(RECOMMEND) ── payload.movieIds 累计推荐次数
    │  ├─ rental.findMany(近 14 天) ── 按日借出桶；RETURNED 子集按日归还桶（缺日补 0）
    │  ├─ rental.count(ACTIVE) + movie.aggregate(totalStock) ── 借出占比
    │  ├─ movie.findMany(stock ≤ 1) ── 低库存列表
    │  ├─ rental.findMany(近 30 天) + movie.moods/scenes ── 标签计数 TOP 5
    │  └─ user.count 总量 + behaviorLog.groupBy(userId, 近 7 天) ── 活跃概况
    │
    ▼
InsightsAdminPage ── 纯 CSS 条形图 + 表格渲染（无图表库），加载/错误/空态齐全
```

只读聚合，不加表、不加埋点；窗口与低库存阈值（`stock ≤ 1`）为契约常量（见 API_CONTRACT §3.13）。

### 5.8 storeInsightTool 对话问数（FU-12）

```
管理员在 chat 提问（「最近什么片最火」「库存怎么样」）
    │
    ▼
classifyIntent ── LLM intent=store_insight + topic；规则兜底关键词
    │  （最火/热门→popular；库存/缺货→inventory；趋势/最近借阅→trend；心情/场景→mood_scene；
    │    活跃/用户数→activity；店况/运营/数据/看板→overview 默认；mood/scene 枚举词优先于 insight 关键词）
    ▼
plan ── { tool: "insight"; topic }
    ▼
dispatch(plan, userId, role) ── admin 门禁
    │  ├─ role ≠ admin → forbidden observation（不调用工具、不返回数据）
    │  └─ admin → storeInsightTool() ── 复用 getStoreInsightsOverview()（一次返回完整 overview）
    ▼
synthesize ── 按 topic 从 overview 切片构造【事实】→ LLM 生成回复（兜底模板）
    │
    ▼
SSE：text（纯文本回复，不新增事件类型；admin 数据/非 admin 拒绝文案均不暴露堆栈）
```

role 从 `authMiddleware` 写入的 `res.locals.role` 经 `routes/chat.ts` → `runChatTurn` → `dispatch` 透传（默认 `"user"` 保守）。工具本身零参数、零聚合逻辑；topic 切片与话术在 `responseSynthesizer` 内完成。

---

## 6. 状态管理

### 6.1 智能体状态对象

编排器为每个请求维护一个状态对象：

```ts
interface AgentState {
  sessionId: string;
  userId: string;
  role: 'admin' | 'user' | 'agent';
  messages: ChatMessage[];        // 工作会话上下文
  intent: Intent | null;
  plan: ToolCall[] | null;
  observations: ToolResult[];
  iteration: number;
  maxIterations: number;
}
```

### 6.2 持久化策略

| 状态类型 | 存储 | TTL / 范围 |
|---|---|---|
| 工作会话上下文 | 每个 SSE 请求的内存 | 单次请求 |
| 会话与消息历史 | PostgreSQL `Session` / `ChatMessage` 表（FU-7 起） | 持久 |
| 用户画像 | PostgreSQL `Profile` 表 | 持久 |
| 活动历史 | PostgreSQL `BehaviorLog` 表 | 持久 |
| 工具结果缓存 | 供地图 POI 的可选 Redis/内存 | 短 TTL（分钟级） |

---

## 7. 外部集成

| 服务 | 用途 | 安全规则 |
|---|---|---|
| **DeepSeek API** | 默认 LLM 供应商（`deepseek-v4-flash`），经 `@fairy/ai-sdk` 的 OpenAI 兼容 adapter。 | 密钥经环境变量（`DEEPSEEK_API_KEY`）；不记录 prompt 或密钥。 |
| **OpenAI API** | 备选 LLM 供应商（`AI_PROVIDER=openai`）。 | 与 DeepSeek 相同。 |
| **Claude API** | 备选 LLM 供应商（`AI_PROVIDER=claude`）。 | 与 DeepSeek 相同。 |
| **Amap Server API** | POI 校验与路线规划。 | 仅服务端使用；密钥绝不暴露给前端。 |
| **Amap JS API** | 浏览器内地图渲染。 | 前端密钥受限 referrer。 |

供应商特化逻辑（请求构造、SSE 解析、错误分类）只存在于 `packages/ai-sdk`；`apps/api` 通过 `AI_PROVIDER`/`AI_MODEL` 等环境变量选择，不直接 import 任何供应商客户端。

---

## 8. 关键架构决策

| 决策 | 理由 |
|---|---|
| 单一聊天端点 `/api/chat` | 集中 agent 治理、认证与日志记录。 |
| 显式状态循环而非单一提示词 | 更易调试、测试，并能约束工具执行。 |
| 画像优先设计 | 所有个性化流程在此前先读取 `Profile`；避免重复偏好逻辑。 |
| 只追加行为日志 | 为 agent 记忆与业务分析提供可观测历史。 |
| 服务端校验 AI 生成的地点 | 防止幻觉目的地触达用户。 |
| 库存写入统一经 `rentalService.borrow` | chat 工具与 REST（FU-6 `POST /api/borrow`）只是两个传输口，无第二套借阅逻辑。 |
| 租借记录只有只读查询端口 | FU-8 `GET /api/rentals` 仅读租借表（本人或 admin 代查）；归还写操作无 REST 端点，仍只经 chat 工具链，避免第二套库存变更路径。 |
| 会话落库为旁路（side-channel） | `appendTurn` 在 SSE 响应前执行但失败仅记日志、不中断流；可观测性损失而非功能损失，保证持久化故障不阻塞对话。 |
| 会话标题由首条消息派生 | 新建会话标题为空，首次落库时取首条非空用户消息前 20 字；避免创建会话时的额外输入步骤。 |
| 历史注入为纯文本旁路（已由 FU-14 替换） | 最近 10 条消息以「用户/Fairy」文本注入 intent + 合成 prompt；不注入 `payload` 结构化事件。FU-14 记忆中心一期将注入源升级为「记忆检索 ≤5 条 + 近期会话历史共存」——见下行。 |
| 登录/注册按 IP 限流 | express-rate-limit，login 10 次/15 分钟、register 20 次/小时；限流器在 `createApp()` 内创建保证测试隔离。生产反代后须启用 trust proxy（见 API_CONTRACT §3.0）。 |
| refresh token 旋转 + 复用吊销 | DB 只存 sha256 哈希（不明文）；旋转时旧 token 置 `revokedAt` + `replacedByTokenId`，检测到复用已吊销 token 即吊销该用户全部 refresh token，压缩 token 泄露窗口。 |
| 前端 401 单飞刷新 | 共享 in-flight refresh promise，并发 401 只发一次 `/auth/refresh`，成功后重试原请求；刷新失败才清登录并跳转。SSE（chatApi）保持直连 401 → 清登录，不引入流中断重试。 |
| 运营洞察单端点一次返回全部 | `GET /api/insights/overview`（admin-only）聚合热门影片/趋势/库存/分布/活跃五类卡片，减少 round-trip；数据量小，窗口与低库存阈值（`stock ≤ 1`）为契约常量（FU-11）。 |
| 聚合用 Prisma groupBy/count 并行 + JS 补零 | 数据量级下 `Promise.all` 并行规避 Neon 冷启动串行延迟；趋势缺日补 0 在 JS 内存按服务器本地日期分桶完成，避免 SQL 时区逻辑（FU-11）。 |
| insight 工具 admin 门禁放在 dispatch | 非 admin 在分发层直接拒绝，不调用工具、不返回数据；role 经 `routes/chat.ts` → `runChatTurn` → `dispatch` 透传（默认 `"user"` 保守），复用 `authMiddleware` 已写入的 `res.locals.role`（FU-12）。 |
| insight 工具返回完整 overview，切片在 synthesizer | 工具零参数、零聚合逻辑，复用 FU-11 单端点「一次返回全部」决策；topic 只决定 synthesizer 构造哪些【事实】，回复聚焦且省 token（FU-12）。 |
| 运营问数规则优先级：mood/scene 枚举 > insight 关键词；借/还分支内嵌 insight 判定 | 「心情不好想看治愈的」是 recommend 而非 mood_scene 洞察；「最近借阅情况」含「借」字但属 trend，借分支无唯一片名时先试 insight 再判 borrow_unresolved（FU-12）。 |
| insight 关键词先于 LLM 判定运营问数 | 真机验收发现 deepseek 模型对严格 JSON 输出不可靠（偶发输出 177~200 token 的自创 schema 长文本），「最近什么片最火」等会被误判 chitchat，规则兜底轮不到；改为 `classifyIntent` 先跑规则，命中 store_insight 即返回（LLM 不调用），其余意图仍 LLM 优先、规则兜底——保证 AC-5 口语问数确定性（FU-12）。 |
| plan_trip 规则先于 LLM；Amap 校验可选降级 | 「帮我规划周末去杭州玩」等由规则关键词（旅行/出游/行程/规划/想去/旅游/周末去哪/去…玩）先于 LLM 确定性判定（同 FU-12 store_insight 模式）；`planTripTool` 以 LLM 草稿 + 高德服务端 POI/路线校验防幻觉，`AMAP_SERVER_KEY` 缺失/失败时降级为未校验草稿（POI 标 `validated=false`、`route=null`，不暴露密钥/堆栈）；行程落库 `Trip` + `TRIP_PLANNED` 日志；前端地图叠加路线为二期非目标（FU-13）。 |
| 行程规划对代理人「铃」与绳匠（admin）开放 | Fairy 对「铃」（画像名 `铃`，seed `user@fairy.local`）是全能管家，对绳匠（admin）是服务主人的管家——两者都直接执行行程规划并呈现；其余普通用户仅影片服务——`dispatch` 在 trip 分支按画像名与 role 门禁，非「铃」且非 admin 不调用 `planTripTool`，返回 `TRIP_FORBIDDEN`，回复婉拒（"不是我的专长"）并引导推荐影片，且不发出 `trip` 事件（FU-13 行为修正）。 |
| 记忆抽取每轮旁路 + 结构化检索，不依赖 embed | 每轮对话 SSE 完成后 LLM 抽取（`tryChat("agent.memory")`，低 temperature，失败静默返回空数组）→ 落库 `Memory`；下一轮注入前 `searchMemories(profileId)` 按 kind/时间/关键词限量 5 条。一期不用 pgvector/embed（DeepSeek 供应商不支持 embed，避免绑定 OpenAI key 环境），结构化检索够用；管理 UI、REST 端点、画像回写为二期（FU-14）。 |
| 记忆管理面 admin-only（REST + 管理页） | 记忆承载用户画像敏感信息，审计/纠错/补录只对绳匠（admin）开放；列表分页筛选沿用 FU-1 `/api/profiles`、FU-3 behavior-logs 的 `requireRole("admin")` + `{code,data,msg}` + shared Zod 校验约定，UI 沿用 FU-11 `/admin/*` 管理页与 i18n 模式，无新抽象（FU-15）。 |
| 记忆删除为硬删、手动新增允许 | `Memory` 无外键引用、无审计保留诉求 → 物理删除，沿用 movie DELETE 的 `{code:"OK", data:{id}}` envelope（FU-5）；admin 可手动补录，与 LLM 抽取同库同链路，落库即被下一轮注入（FU-15）。 |
| pgvector 向量检索推后（FU-15 拍板，已被 FU-16 取代） | 原二期候选理由：需 embedding 列 + Neon pgvector 扩展 + 支持 embed 的供应商（DeepSeek 不支持）、会改变检索语义——FU-16 以「可选 embed 配置 + 混合检索 + 默认零变化」落地该候选（见下行）。 |
| 向量检索 = 可选 embed 客户端 + 混合检索（FU-16） | `EMBEDDING_API_KEY`（缺省回退 `OPENAI_API_KEY`）/`EMBEDDING_MODEL`（默认 `text-embedding-3-small`，1536 维）独立于聊天供应商（`AI_PROVIDER=deepseek` 也能 embed；缺 key → 客户端 null 降级信号）；对话注入 `searchMemories(profileId, { query })` 在有 query + embed 可用 + 行含向量时走 `$queryRaw` cosine 升序 top-N（`kind`/`keyword` 可预过滤），不足 limit 按时间倒序补齐（排除已召回 id）；无 key/embed 故障/维度不符/无向量 → 结构化路径，默认 dev 环境零行为变化。写入与回填共用同一 embed 链路：新记忆（FU-14 抽取 + FU-15 admin 新增）落库实时生成向量，存量由 `scripts/backfill-memory-embeddings.ts` 幂等回填（只补 `embedding IS NULL` 行）。`memories.embedding` 列 raw SQL 读写、永不下发 DTO，公共 API 契约不变。 |
| 记忆自查 = 会话页只读面板 + `GET /api/memories/me`（FU-17） | 「让用户看到 Fairy 记得什么」降门槛落地为**自查而非管理**：利用 `Profile.userId` 主键 == `Memory.profileId` 的恒等式，`/me` 以 token 身份（`res.locals.userId`）作 where，零迁移、不 join email；校验层用 zod 剥除越权参数（`userId`/`email`）杜绝跨用户读取；UI 只读（无增删改），来源标注按 `sessionId` 有无推断「对话抽取/系统录入」，与 admin 管理面共享 kind/分页/过滤语义但彼此独立（FU-17）。 |
| 偏好记忆反向回写 only `likeGenres` + 增量合并 + 词表白名单（FU-18） | 范围收敛为「抽取候选 → `Profile.likeGenres` 增量沉淀」：一次 LLM 调用在 `memories` 旁同产顶层 `genres`（≤3，避免每条记忆重复出候选）；回写门禁 = 本轮 ≥1 条 preference **落库成功** 且候选非空（LLM 只给候选没落偏好记忆时不写，杜绝歧义路径）；白名单在**代码侧**过滤（提示词不注入 DB 词表，避免 prompt 与影片 CRUD 耦合），词表 = `Movie.genres` distinct + 空/纯数字剔除 + 进程内 TTL 5min 缓存；合并事务内 Set 并集、只增不减、无变化不写，与 FU-1 PATCH 手动路径并存。不回写其他画像字段、不做存量回填、无新端点（FU-18）。 |

---

## 9. 模块到目录的映射

```
apps/web/src/
  components/
    chat/              # ChatPage（含会话侧栏）, MessageStream, RecommendationCard, TripTimeline, MemorySelfPanel（FU-17 自查面板，ChatPage 内开关）
    fairy/             # FairyAvatar, expressions
    admin/             # MoviesAdminPage, ProfilesAdminPage, BehaviorPage, InsightsAdminPage（FU-11 运营看板）, MemoryAdminPage（FU-15 记忆管理）
  hooks/
    useSSE.ts          # SSE 流消费
  lib/
    sessionApi.ts      # FU-7：/api/sessions 客户端
    insightApi.ts      # FU-11：/api/insights 客户端
    memoryApi.ts       # FU-15：/api/memories 客户端（列表/新增/编辑/删除）；FU-17：listMyMemories（/api/memories/me 自查）
  stores/
    chatStore.ts

apps/api/src/
  routes/
    chat.ts            # POST /api/chat（SSE）
    sessions.ts        # /api/sessions（FU-7：创建/列表/消息回放）
    insights.ts        # /api/insights（FU-11：GET /overview，requireRole("admin")）
    movies.ts
    rentals.ts
    trips.ts
    profiles.ts
    memories.ts        # /api/memories（FU-15：GET/POST + PATCH/DELETE /:id，全部 requireRole("admin")；FU-17：GET /me 自查路由，任意已登录角色，置于 admin 路由前）
  agent/
    stateLoop.ts         # FU-12：runChatTurn 透传 role → dispatch；FU-14：查询记忆注入；FU-16：传 query（用户消息）驱动混合检索
    intentClassifier.ts  # FU-12：store_insight 意图 + topic（LLM 枚举 + 规则兜底）
    contextBuilder.ts  # FU-7：buildConversationHistory 历史注入；FU-14：buildMemoryBlock 记忆注入
    planner.ts          # FU-12：PlannedCall 新增 { tool: "insight"; topic }
    toolDispatcher.ts   # FU-12：kind "insight" observation + admin 门禁（role 参数）
    responseSynthesizer.ts  # FU-12：按 topic 构造运营问数【事实】+ 非 admin 拒绝文案；FU-14：记忆注入 prompt
  memory/
    memoryService.ts     # FU-14：addMemory 落库 + searchMemories 检索（profileId 隔离，限量）；FU-15：listMemories/create/update/delete admin 管理查询；FU-16：searchMemories 混合检索（query→cosine top-N+结构化补齐）、addMemory/createMemory 落库后实时 embed；FU-17：listOwnMemories（profileId 限定自查列表，不带 email）
    memoryExtractor.ts   # FU-14：LLM 抽取（agent.memory source，失败静默）+ 旁路落库入口；FU-18：同 JSON 产顶层 genres（≤3），本轮 ≥1 条 preference 落库且候选非空时旁路调 profileService.mergeLikeGenres（失败静默）
    embeddingClient.ts   # FU-16：embed 客户端组装（memoize createEmbeddingProvider，读 EMBEDDING_* env）+ embedContent(text) → number[] | null（1536 维守卫，失败静默）
  tools/
    recommendMovieTool.ts
    borrowMovieTool.ts
    planTripTool.ts
    storeInsightTool.ts  # FU-12：零参数，复用 insightService（对话问数）
  services/
    movieService.ts
    rentalService.ts
    profileService.ts    # FU-1：画像 CRUD（create/update/list，P2002/P2025 处理）；FU-18：mergeLikeGenres（事务内并集去重并入 likeGenres）+ loadGenreWhitelist（Movie.genres distinct + 脏值过滤 + TTL 5min 缓存）
    behaviorLogService.ts
    sessionService.ts  # FU-7：会话 CRUD + appendTurn 事务
    insightService.ts  # FU-11：运营看板聚合（只读）
    amapClient.ts
  controllers/
    sessionsController.ts  # FU-7
    insightController.ts   # FU-11
    memoryController.ts    # FU-15：记忆管理 REST handlers（薄，校验在 shared schema / validate 中间件）；FU-17：listMyMemoriesHandler（读 res.locals.userId）
  middleware/
    auth.ts
    validateBody.ts

packages/shared/
  schemas/             # 前端与后端使用的 Zod schema（含 sessionSchemas，FU-7；insightSchemas，FU-11；insightTopicSchema，FU-12；memorySchemas，FU-14/15/17/18）
  types/               # 共享 TypeScript 类型（含 sessionTypes，FU-7）

packages/ai-sdk/
  providers/           # OpenAI/Claude 客户端封装
  streaming.ts         # 统一流式辅助函数
  factory.ts           # FU-16：createEmbeddingProvider + EMBEDDING_DEFAULT_MODEL/EMBEDDING_DIMENSIONS（可选 embed 客户端，缺 key → null）

packages/database/
  prisma/schema.prisma # Memory.embedding `Unsupported("vector(1536)")?`（FU-16：raw SQL 读写，永不下发 DTO）
  prisma/migrations/   # add_memory_embedding（CREATE EXTENSION vector + 列 + HNSW cosine 索引）

scripts/
  backfill-memory-embeddings.ts  # FU-16：存量记忆幂等回填（`pnpm --filter=@fairy/database backfill:embeddings`，只补 embedding IS NULL 行）

docs/
  architecture.md      # 本文档
  tools.md             # 工具注册表与 schema
  prompts.md           # 系统提示词与提示词模板
```

---

## 10. 验证与演进

- **本地一次启动前后端**：在 `Fairy/` 下运行 `pnpm dev`——根 turbo 编排（`Fairy/turbo.json` 以 `tasks` 声明任务，dev 为 `cache:false` + `persistent:true`）并行执行 api 与 web 的 dev script（二者是 workspace 中仅有的 dev 任务），日志带 `@fairy/api:dev` / `@fairy/web:dev` 前缀，Ctrl+C 一并停止。单独启动仍用 `pnpm --filter=@fairy/api dev` / `pnpm --filter=@fairy/web dev`。
- 改动 `agent/` 或 `tools/` 后运行 `pnpm --filter=@fairy/api test`。
- 为每个新工具与状态迁移补充单元测试。
- 新增意图、工具或外部集成时，保持本文档最新。

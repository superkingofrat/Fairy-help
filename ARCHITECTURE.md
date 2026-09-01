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

### 5.4 记忆 / 画像流程

```
每次工具执行
    │
    ▼
[BehaviorLogService] 追加记录
    │
    ▼
后续 ContextBuilder 读取
    ├── 最近 N 条 Session 消息（短期）
    ├── 近期 BehaviorLog 记录（中期）
    └── Profile 实体（长期）
    │
    ▼
[Prompt 上下文窗口] 受 token 预算约束
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
| 历史注入为纯文本旁路（`TODO(memory-center)`） | 最近 10 条消息以「用户/Fairy」文本注入 intent + 合成 prompt；不注入 `payload` 结构化事件。memory-center 实现后迁移（AGENTS §6 临时内联查询已登记技术债）。 |

---

## 9. 模块到目录的映射

```
apps/web/src/
  components/
    chat/              # ChatPage（含会话侧栏）, MessageStream, RecommendationCard, TripTimeline
    fairy/             # FairyAvatar, expressions
    admin/             # MoviesAdminPage, ProfilesAdminPage, BehaviorPage
  hooks/
    useSSE.ts          # SSE 流消费
  lib/
    sessionApi.ts      # FU-7：/api/sessions 客户端
  stores/
    chatStore.ts

apps/api/src/
  routes/
    chat.ts            # POST /api/chat（SSE）
    sessions.ts        # /api/sessions（FU-7：创建/列表/消息回放）
    movies.ts
    rentals.ts
    trips.ts
    profiles.ts
  agent/
    stateLoop.ts
    intentClassifier.ts
    contextBuilder.ts  # FU-7：buildConversationHistory 历史注入
    planner.ts
    toolDispatcher.ts
    responseSynthesizer.ts
  tools/
    recommendMovieTool.ts
    borrowMovieTool.ts
    planTripTool.ts
    storeInsightTool.ts
  services/
    movieService.ts
    rentalService.ts
    profileService.ts
    behaviorLogService.ts
    sessionService.ts  # FU-7：会话 CRUD + appendTurn 事务
    amapClient.ts
  controllers/
    sessionsController.ts  # FU-7
  middleware/
    auth.ts
    validateBody.ts

packages/shared/
  schemas/             # 前端与后端使用的 Zod schema（含 sessionSchemas，FU-7）
  types/               # 共享 TypeScript 类型（含 sessionTypes，FU-7）

packages/ai-sdk/
  providers/           # OpenAI/Claude 客户端封装
  streaming.ts         # 统一流式辅助函数

docs/
  architecture.md      # 本文档
  tools.md             # 工具注册表与 schema
  prompts.md           # 系统提示词与提示词模板
```

---

## 10. 验证与演进

- 改动 `agent/` 或 `tools/` 后运行 `pnpm --filter=@fairy/api test`。
- 为每个新工具与状态迁移补充单元测试。
- 新增意图、工具或外部集成时，保持本文档最新。

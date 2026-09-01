# Fairy — 项目状态

---

## Project Phase（项目阶段）

**Development（开发中）**

> Monorepo 脚手架、影片库 CRUD MVP、Phase 2 Agent 推荐与借阅、FU-1 画像写接口与管理 CRUD、FU-2 真实 LLM 意图与回复、FU-3 行为流水查询与管理页、FU-4 归还（聊天文本）、FU-5 真实 JWT 认证、FU-6 REST 借阅、FU-7 会话表与对话历史回放、FU-8 一键归还 UI、FU-9 影片库浏览页、FU-10 账号体系闭环（注册/限流/refresh token）、FU-11 运营洞察看板（管理端）已交付。

---

## Completed Modules（已完成模块）

- **FU-11 运营洞察看板（第一期：管理端）**（2026-09-01）— admin-only `GET /api/insights/overview` 单端点一次返回看板全部卡片（热门影片 TOP 5 按 RECOMMEND `payload.movieIds` 统计推荐次数、借阅/归还趋势 14 天缺日补 0（服务器本地日期分桶）、库存状态与低库存 `stock ≤ 1`、mood/scene 30 天分布 TOP 5、活跃概况），`Promise.all` 并行聚合规避 Neon 冷启动串行延迟；shared `insightSchemas`（7 个 schema + 类型）；web `/admin/insights` 看板页（纯 CSS 卡片与条形图、不引图表库，加载/错误/空态齐全 + i18n + 刷新按钮）；导航与路由挂 `RequireAuth role="admin"`（user 跳转首页）；测试：api 154（insightService 6 + insights routes 3）、web 50（InsightsAdminPage 3 + App 更新）、shared 56（insightSchemas 3）全绿；真机验收 AC-1~AC-8 全过（admin 导航 + 看板数据正确（08-19 等缺日补 0、低库存 stock≤1）、user 访问 403、无 token 401、mood/scene 分布、加载/错误/空态 + 中文本地化）；需求：[2026-09-01-store-insights.md](docs/requirements/2026-09-01-store-insights.md)；OpenSpec 归档：[2026-09-01-fu-11-store-insights](openspec/changes/archive/2026-09-01-fu-11-store-insights/)

- **FU-10 账号体系闭环（注册 / 登录限速 / refresh token）**（2026-09-01）— 注册 `POST /api/auth/register`（仅开放 `role=user`、bcrypt cost 10、201 返回 `{ token, refreshToken, user }` 注册即登录、409 `EMAIL_ALREADY_EXISTS`、400 `VALIDATION_ERROR`）；登录/注册 IP 限流（express-rate-limit，login 10 次/15 分钟、register 20 次/小时，429 `TOO_MANY_REQUESTS`；限流器在 `createApp()` 内创建保证测试隔离，生产反代后须 `trust proxy`）；refresh token 旋转 + 复用吊销（`RefreshToken` 表只存 sha256 哈希、30 天过期、旋转在事务内置 `revokedAt`+`replacedByTokenId`、复用已吊销 token 即吊销该用户全部 refresh token、`POST /api/auth/logout` 吊销当前 token）；shared `registerSchema`/`refreshTokenSchema`；Web：`RegisterPage` + `/register` 公开路由 + 登录页注册链接、authStore `refreshToken` 持久化、`lib/http.ts` 统一认证客户端（401 单飞刷新 → 重试一次 → 刷新失败才 `clear()` + 跳 `/login`；movieApi/profileApi/sessionApi/behaviorApi/rentalsApi 迁移、导出签名不变）、chatApi SSE 保持原样（401 仍直接清登录，注明取舍）；测试：api 145（auth 14：register 201/409/400、login 带 refreshToken、rotation 更新+新建断言、复用→全家吊销、过期、logout 幂等、第 11 次 429）、web 47（RegisterPage 4、http 单飞刷新 6、LoginPage/App 更新）、shared 47（authSchemas 新增 11）；真机验收全过：HTTP 11/11（注册 201/409/400、登录带 refreshToken、刷新旋转、复用旧 token → 401 且新 token 也死、登出后 refresh 401、ghost token 401）+ 浏览器 E2E（注册即自动登录 `/chat`、重复邮箱文案「该邮箱已注册」、短密码/两次不一致前端校验、登录页「还没有账号？注册一个」链接、登录成功）+ 限流实测（窗口内第 11 次起 429，`touch` API 源文件 reload 后重置）；需求：[2026-09-01-fu-10-account-closure.md](docs/requirements/2026-09-01-fu-10-account-closure.md)；OpenSpec 归档：[2026-09-01-fu-10-account-closure](openspec/changes/archive/2026-09-01-fu-10-account-closure/)

- **FU-7 Session 表与对话历史回放**（2026-09-01）— `Session`/`ChatMessage` Prisma 模型 + 迁移（消息 `role`/`payload` JSON/索引）；shared session schemas/types（`chatEventSchema`/`chatMessageDto`/`sessionListItem`）；API：`sessionService`（createSession/listSessions/getOwnedSession/getSessionMessages/getRecentMessages/appendTurn 事务，标题首条消息前 20 字派生）+ `/api/sessions` 三端点（POST 201 / GET 列表按 `updatedAt` 倒序含消息数 / GET `:id` 回放）+ chat 落库旁路（`appendTurn` 失败仅记日志不中断 SSE，done 事件携带 `sessionId`）+ `chatRequestSchema` 可选 `sessionId` + 404 `SESSION_NOT_FOUND` / 403 `SESSION_FORBIDDEN`（SSE 前返回）+ `contextBuilder.buildConversationHistory` 注入最近 10 条纯文本（`TODO(memory-center)` 技术债）；Web：`sessionApi` + ChatPage 会话侧栏（新建/切换/恢复）+ 历史回放（文本 + 推荐卡借还事件走同一渲染路径，刷新后重取）+ i18n；测试：api 135（17 文件，新增 sessionService 8 / sessions routes 5 / contextBuilder 1，chat +6）、web 36（ChatPage 12）、shared 36（sessionSchemas 12 / chatSchemas +3）全绿；真机验收 AC-1~AC-7 全过（含跨用户 403、刷新恢复、回放卡借阅落当前会话、admin 全链路）；需求：[2026-09-01-fu-7-session-history.md](docs/requirements/2026-09-01-fu-7-session-history.md)；OpenSpec 归档：[2026-09-01-fu-7-session-history](openspec/changes/archive/2026-09-01-fu-7-session-history/)

- **FU-9 影片库浏览页（直接借阅）**（2026-09-01）— `/movies` 用户页（RequireAuth，user+admin）+ 顶部导航「影片库」；分页目录 + mood/scene 标签筛选 + keyword 搜索（复用 `GET /api/movies` / `/api/movies/search`）；借阅按钮直调 REST `POST /api/borrow`（成功标记「已借」+ 轻提示 + refetch rentals/目录；失败卡片内按 code 映射友好文案，无 500）；已借标记取自 `GET /api/rentals?status=ACTIVE`（已借卡片置灰「已借」，跨页一致）；库页**无归还按钮**（归还仍只经 chat 工具链，双写禁令不变）；纯 web 改动、后端/shared 零改动；web 31 测试（新增 MovieLibraryPage 7 + App 2）；需求：[2026-09-01-fu-9-movie-library-page.md](docs/requirements/2026-09-01-fu-9-movie-library-page.md)；OpenSpec 归档：[2026-09-01-fu-9-movie-library-page](openspec/changes/archive/2026-09-01-fu-9-movie-library-page/)

- **FU-8 一键归还 UI（含 rentals 查询端点）**（2026-09-01）— `GET /api/rentals`（Bearer-only、本人或 admin `?userId=` 代查、`?status=ACTIVE` 过滤、`RentalListItem` 行形状含 `movieTitle`、403/404/400/401 错误映射、无分页）；chat 请求 `action: "return"` + `movieId` 确定性归还（绕过 LLM 意图分类、直接复用 `returnMovieTool` + synthesize，无新增回复分支）；chat 页「我的借阅」条（空态整条隐藏）+ 推荐卡片借/还切换（归还按钮在 stock=0 时也可用）；SSE `return` 成功乐观移除/失败刷新；需求：[2026-08-29-fu-8-return-button-ui.md](docs/requirements/2026-08-29-fu-8-return-button-ui.md)；OpenSpec 归档：[2026-09-01-fu-8-return-button-ui](openspec/changes/archive/2026-09-01-fu-8-return-button-ui/)

- **FU-6 REST 借阅接口**（2026-09-01）— `POST /api/borrow`（Bearer-only、body `{ movieId }`、借阅人=token subject、body 内 `userId` 忽略、201/404 `MOVIE_NOT_FOUND`/409 `ALREADY_BORROWED`/409 `OUT_OF_STOCK`/400 `VALIDATION_ERROR`/401）、直接复用 `borrowMovieTool` 同一事务+行为日志组合（无第二套借阅实现）、7 个路由测试、共享 `borrowRequestSchema`；需求：[2026-08-31-fu-6-rest-borrow.md](docs/requirements/2026-08-31-fu-6-rest-borrow.md)；OpenSpec 归档：[2026-09-01-fu-6-rest-borrow](openspec/changes/archive/2026-09-01-fu-6-rest-borrow/)

- **FU-5 真实 JWT 认证（仅登录）**（2026-08-31）— `POST /api/auth/login` + `GET /api/auth/me`（bcrypt 校验、统一 401 防枚举、HS256 12h token）、`authMiddleware` 重写为 Bearer-only（dev stub 彻底移除）、`JWT_SECRET` 启动必填、web `/login` 页 + 路由守卫 + 角色化导航 + 401 自动登出、chat 说话人=登录者；账号=种子固定开发密码（`user@fairy.local`/`user123456`、`admin@fairy.local`/`admin123456`，demo-only 上线前必须改密），注册/建号拆后续 FU；需求：[2026-08-30-fu-5-jwt-auth.md](docs/requirements/2026-08-30-fu-5-jwt-auth.md)；OpenSpec 归档：[2026-08-31-fu-5-jwt-auth](openspec/changes/archive/2026-08-31-fu-5-jwt-auth/)

- **FU-4 归还：回补库存与还片意图（聊天文本）**（2026-08-30）— `rentalService.returnRental` 事务（闭租借 + 库存回补 + `RENTAL_NOT_FOUND` 幂等）、`returnMovieTool` + `RETURN_SUCCESS` 行为日志（枚举迁移已部署 dev 库）、return 意图（LLM + 规则「还」+唯一片名分支，hái/huán 防误判）、SSE `return` 事件、unresolved 回复列出现有借阅；验收期修复：枚举迁移延迟部署（P0）+ chat 流内错误降级加固（P1）；一键归还按钮拆至 FU-8；需求：[2026-08-29-fu-4-return-rentals.md](docs/requirements/2026-08-29-fu-4-return-rentals.md)；OpenSpec 归档：[2026-08-30-fu-4-return-rentals](openspec/changes/archive/2026-08-30-fu-4-return-rentals/)

- **FU-3 BehaviorLog 查询与流水管理页**（2026-08-29）— admin-only `GET /api/behavior-logs`（分页、action/userId 筛选、email/movieTitle/recommendCount 解析、append-only 无 mutation 路由）、`/admin/behavior` 流水页（动作筛选 + 分页 + 三态）、`BehaviorLog` 增加 `@@index([createdAt])` 迁移已应用 dev 库；需求：[2026-08-29-fu-3-behavior-log-query-admin-ui.md](docs/requirements/2026-08-29-fu-3-behavior-log-query-admin-ui.md)；OpenSpec 归档：[2026-08-29-fu-3-behavior-log-query-admin-ui](openspec/changes/archive/2026-08-29-fu-3-behavior-log-query-admin-ui/)

- **FU-2 真实 LLM 替换规则意图与模板回复**（2026-08-29）— `@fairy/ai-sdk` 统一 `chat()/stream()/embed()` + 三供应商（DeepSeek 默认 `deepseek-v4-flash`/OpenAI/Claude，env 工厂 + 类型化错误 + usage 元数据）、意图与回复 LLM 化（zod 结构化 JSON、事实边界防幻觉、chitchat）、规则/模板整体降级 fallback、SSE 协议与前端零改动；需求：[2026-08-29-fu-2-real-llm-intent-and-replies.md](docs/requirements/2026-08-29-fu-2-real-llm-intent-and-replies.md)；OpenSpec 归档：[2026-08-29-fu-2-real-llm-intent-and-replies](openspec/changes/archive/2026-08-29-fu-2-real-llm-intent-and-replies/)

- **FU-1 画像写接口与管理 CRUD**（2026-08-29）— 复数 REST `/api/profiles`（admin 列表按 User 展开、补建 409、PATCH 原子更新、无 DELETE）、`/admin/profiles` 管理页、契约废弃单数路径、新增 `USER_NOT_FOUND`/`PROFILE_ALREADY_EXISTS`；需求：[2026-08-24-fu-1-profile-write-admin-crud.md](docs/requirements/2026-08-24-fu-1-profile-write-admin-crud.md)；OpenSpec 归档：[2026-08-29-fu-1-profile-write-admin-crud](openspec/changes/archive/2026-08-29-fu-1-profile-write-admin-crud/)

- **Phase 2 Agent 推荐与借阅**（2026-08-24）— `/chat` + `POST /api/chat` SSE、规则意图、`recommendMovieTool` / `borrowMovieTool`、Prisma `Profile` / `Rental` / `BehaviorLog`、一键借阅与库存事务；需求：[2026-08-21-phase2-agent-recommend-borrow.md](docs/requirements/2026-08-21-phase2-agent-recommend-borrow.md)；OpenSpec 归档：[2026-08-24-phase2-agent-recommend-borrow](openspec/changes/archive/2026-08-24-phase2-agent-recommend-borrow/)
- **影片库 CRUD MVP**（2026-08-20）— Movie 模型/迁移/seed、REST CRUD + 搜索、dev auth stub、`/admin/movies` 管理页、单元测试；需求：[2026-08-19-mvp-scope.md](docs/requirements/2026-08-19-mvp-scope.md)；Trellis 任务 `08-19-movie-crud`（已归档）
- **`AGENTS.md` §15 智能体确认门禁**（2026-08-20）— 双轨实现路径、P0/P1 豁免、记录矩阵、§9 联调 checklist；需求：[2026-08-20-agent-execution-norms-review.md](docs/requirements/2026-08-20-agent-execution-norms-review.md)
- 项目脊柱文档（`AGENTS.md`、`ARCHITECTURE.md`、`API_CONTRACT.md`、`PROJECT_STATUS.md`）
- `Fairy/` 下的 monorepo 脚手架骨架：
  - pnpm workspace + Turborepo 配置
  - `apps/web`（React + TypeScript + Tailwind CSS + Zustand + Vite + Vitest）
  - `apps/api`（Node.js + Express + tsx + Vitest）
  - `packages/shared`（Zod schema + 共享类型）
  - `packages/ai-sdk`（OpenAI / Claude 封装）
  - `packages/database`（Prisma + PostgreSQL）
  - `docs/` 与 `scripts/` 占位目录

---

## In Progress（进行中）

- **FU-12 运营洞察 chat 工具（第二期：对话问数）**（实现中，Trellis 轨）— `storeInsightTool` 零参工具接入 agent 链路：`classifyIntent` 新增 `store_insight` 意图（LLM JSON `topic` 字段 + 规则兜底 `classifyStoreInsightByRules`：热门/库存/趋势/心情场景/活跃/总览关键词；**insight 关键词先于 LLM**——真机验收发现模型严格 JSON 输出不可靠会误判 chitchat，规则命中即返回保证 AC-5 确定性）；`planner` 映射 `{ tool: "insight", topic }`；`dispatch` admin 门禁（非 admin 不调用工具直接 `FORBIDDEN`，默认 role="user" 保守）；`responseSynthesizer` 按 topic 从完整 overview 切片生成回复（含空态与 `INSIGHT_UNAVAILABLE` 降级）；shared `insightTopicSchema`；测试全绿：api 180（22 文件）、shared 58；**真机验收 AC-1~AC-7 全过**（admin：最火/库存/趋势/mood/活跃/店况均返回真实数据、user：友好拒绝且工具未调用、SSE done 正常、口语问数全部落 store_insight）；待办：Trellis journal、提交。需求：[2026-09-01-store-insight-chat-tool.md](docs/requirements/2026-09-01-store-insight-chat-tool.md)（已 approved）；Trellis task `09-01-fu-12-store-insight-chat-tool`。

---

## Next Steps（下一步）

- （挂账）旅行规划（`amapClient`/`planTripTool` 0 行，trips 占位）。
- （技术债）memory-center（历史注入现为 `TODO(memory-center)` 纯文本旁路）。

---

## Risks & Decisions（风险与决策）

### 风险

- **数据库依赖** — 须配置 `DATABASE_URL`（Neon 或本地 PostgreSQL）；`packages/database/.env` 与 `apps/api/.env` 必须同步（见 AGENTS §9）。
- **Neon 冷启动** — Prisma 默认 `connect_timeout` 为 5s，计算休眠唤醒时会报 P1001「Can't reach database server」，管理页看起来像 CRUD 全坏。连接串需带 `connect_timeout=15&pool_timeout=15`，且须同时跑 api:3000 与 web:5173。
- **新增影片校验** — 心情/场景必须点选标签；封面空串、年份字符串、总库存 < 可借库存会返回 `Invalid request body`。错误应显示在弹窗内。

### 近期关键决策

| 日期 | 决策 | 负责人 | 备注 |
|---|---|---|---|
| 2026-08-06 | 确定技术栈为 React + Node.js + PostgreSQL | Project Lead | 前端使用 React + TypeScript；后端使用 Node.js + Express；持久化使用 PostgreSQL + Prisma ORM。 |
| 2026-08-19 | 影片库 MVP 使用 dev auth stub | Project Lead | `X-Dev-Role` / `Bearer dev-<role>`；生产环境需替换为 JWT。 |
| 2026-08-19 | Mood/Scene 中文枚举 | Project Lead | mood: 治愈/热血/悬疑/致郁/轻松/浪漫；scene: 雨天/失眠夜/周末午后/独自在家/约会夜/通勤路上。 |
| 2026-08-20 | AI 执行双轨门禁 | Project Lead | 小功能 Trellis + requirements；大变更 OpenSpec；§15 为唯一脊柱来源。 |
| 2026-08-20 | 本地双 `.env` 须同步 | Project Lead | `packages/database/.env` 与 `apps/api/.env` 的 `DATABASE_URL` 必须一致。 |
| 2026-09-01 | 会话落库为旁路 + 标题首条消息派生 | Flores | FU-7：`appendTurn` 失败仅记日志不中断 SSE；空标题会话在首条消息落库时取前 20 字。 |
| 2026-09-01 | 历史注入为纯文本旁路 | Flores | FU-7：最近 10 条以「用户/Fairy」文本注入 intent+合成 prompt，不注入 `payload` 事件；`TODO(memory-center)` 已登记技术债。 |
| 2026-09-01 | 注册仅开放 user 角色 + 注册即登录 | Flores | FU-10：注册恒建 `role=user`（admin 仅 seed），成功即签发 `{ token, refreshToken, user }`，不自动建 Profile。 |
| 2026-09-01 | 登录/注册按 IP 限流 | Flores | FU-10：express-rate-limit，login 10 次/15 分钟、register 20 次/小时；限流器在 `createApp()` 内创建保证测试隔离，生产反代后须 trust proxy。 |
| 2026-09-01 | refresh token 旋转 + 复用吊销 | Flores | FU-10：DB 只存 sha256 哈希；旋转置 `revokedAt`+`replacedByTokenId`；复用已吊销 token 即吊销该用户全部 refresh token。 |
| 2026-09-01 | 运营洞察单端点一次返回全部 | Flores | FU-11：`GET /api/insights/overview`（admin-only）一次返回看板全部卡片；窗口与低库存阈值（`stock ≤ 1`）为契约常量。 |
| 2026-09-01 | 聚合用 Prisma groupBy/count 并行 + JS 补零 | Flores | FU-11：`Promise.all` 并行规避 Neon 冷启动串行延迟；趋势缺日补 0 按服务器本地日期分桶在 JS 完成，避免 SQL 时区逻辑。 |

---

## Last Updated（最近更新）

**2026-09-01**

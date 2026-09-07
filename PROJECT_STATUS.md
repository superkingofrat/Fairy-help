# Fairy — 项目状态

---

## Project Phase（项目阶段）

**Development（开发中）**

> Monorepo 脚手架、影片库 CRUD MVP、Phase 2 Agent 推荐与借阅、FU-1 画像写接口与管理 CRUD、FU-2 真实 LLM 意图与回复、FU-3 行为流水查询与管理页、FU-4 归还（聊天文本）、FU-5 真实 JWT 认证、FU-6 REST 借阅、FU-7 会话表与对话历史回放、FU-8 一键归还 UI、FU-9 影片库浏览页、FU-10 账号体系闭环（注册/限流/refresh token）、FU-11 运营洞察看板（管理端）、FU-12 运营洞察 chat 工具（对话问数）、FU-13 旅行规划（对话行程生成）、FU-14 记忆中心（结构化记忆落库与检索注入）、FU-15 记忆管理面（admin REST + 管理页）、FU-16 pgvector 向量检索（混合检索 + 写入实时 embed + 幂等回填）、FU-17 记忆自查入口（会话页只读面板 + `GET /api/memories/me`）、FU-18 画像反向回写（偏好记忆增量沉淀 `Profile.likeGenres`）已交付。

---

## Completed Modules（已完成模块）

- **FU-18 画像反向回写（偏好记忆自动沉淀 `Profile.likeGenres`，记忆中心五期）**（2026-09-07）— 在 FU-14 抽取旁路上追加一步画像回写，无新端点、无 DB 迁移：shared `memoryExtractionSchema` 增可选顶层 `genres`（`z.array(z.string().trim().min(1)).max(3).optional()`，向后兼容旧输出）+ 测试；api：`memoryExtractor` 提示词扩展（同 JSON 产 `"genres":["片型"]`，语义约束「仅用户表达影片偏好时输出 ≤3」，不注入 DB 词表）+ 内部 `extractTurn`（失败降级 `{memories:[]}`，`extractMemories` 仅取 memories 保持不变）+ 旁路接线（**门禁 = 本轮 ≥1 条 preference 记忆成功落库且候选非空** → `profileService.mergeLikeGenres`，`.catch` 静默）；`profileService` 新增 `loadGenreWhitelist`（`Movie.genres` distinct + 空串/纯数字脏值过滤 + 进程内 TTL 5min 缓存，查询失败返回空名单不抛出，测试专用 `resetGenreWhitelistForTests` 沿用 `resetLlmProviderForTests` 约定）与 `mergeLikeGenres(profileId, candidates)`（白名单过滤 → 事务内读 profile（缺失静默跳过）→ `Set` 并集去重 → 无变化不写 / 有变化 `update likeGenres`；只增不减、绝不覆盖 admin 手动标签）；测试新增：extractor 5 例（有 preference+候选触发、无 preference 不触发、无候选不触发、preference 落库失败不触发、回写抛错不影响落库）+ profileService 10 例（白名单 distinct/缓存/TTL 过期重取/查询失败静默不缓存 + 合并去重/重复调用幂等不 update/无命中不进事务/profile 缺失静默/白名单失败静默/既有标签不删）；文档脊柱：`ARCHITECTURE` §5.4 数据流回写支路 + §8 决策行 + §9 模块映射（memoryExtractor/profileService/共享 schemas FU-18 注记）、`API_CONTRACT` 记忆中心内部行为说明补一句（**无公共契约变更**：不新增端点、不改请求/响应形状，FU-1 `PATCH /api/profiles` 行为不变）；测试全绿：shared 96 / api 292 + shared/api typecheck + `openspec validate --all` 13/13；真机验收 AC-1~AC-6 全过（真实 deepseek 对话）：AC-1 对话「迷上动作片」→ 新 preference 记忆落库且 `likeGenres` 增量并入 `动作`、相同消息重放不重复（幂等）；AC-2「不吃辣」无片型 → 记忆落库但 `likeGenres` 不变、「喜欢歌舞片」候选未命中白名单 → 不变；AC-3 admin PATCH 加 `喜剧`（非白名单标签）后合并 `爱情` → 既有 `科幻/悬疑/喜剧` 全保留（只增不减）；AC-4 LLM 故障/解析失败/白名单查询失败/回写抛错静默降级由单测覆盖（真机 mojibake 输入轮亦实测：LLM 无法理解 → 零落库零回写，对话正常）；AC-5 `PATCH /api/profiles` 响应仍 `{code:"OK",data:{...},msg}`、无新端点；AC-6 admin 新增带 `犯罪` 类型影片 → TTL 内对话不命中（延迟规则生效）→ 重启 API 清缓存后同句命中并入 `犯罪`；验收后清理全部临时会话/记忆/影片并还原 `likeGenres` 基线；需求：[2026-09-07-profile-writeback.md](docs/requirements/2026-09-07-profile-writeback.md)；OpenSpec 归档：[2026-09-07-profile-writeback](openspec/changes/archive/2026-09-07-profile-writeback/)
- **FU-17 记忆自查入口（会话页「Fairy 记住了什么」只读面板，记忆中心四期）**（2026-09-07）— 利用 `Profile.userId` 主键 == `Memory.profileId` 恒等式零迁移落地自查面：shared `memorySchemas` 新增自查 schema（`memorySelfQuerySchema`（page/limit/kind/keyword，未知键自动剥除——越权 `userId`/`email` 视同不存在）、`memorySelfListItemSchema`（含 `sessionId` 可空，不带 email/userId）、`memorySelfListFeedSchema` + 类型 + 测试）；api：`memoryService.listOwnMemories(profileId, query)`（profileId 限定 + kind/keyword 过滤 + createdAt 倒序分页，不 join email）+ `routes/memories.ts` `GET /me`（置于 admin 路由前，任意已登录角色；无 token 401、非法 kind 400，无 403 分支）+ `memoryController.listMyMemoriesHandler`（读 `res.locals.userId`）；web：`lib/memoryApi.listMyMemories`（不带 userId/email）+ `components/chat/MemorySelfPanel`（只读：kind 标签 + 来源标注——`sessionId` 非空「对话抽取」/空「系统录入」+ 时间倒序 + 分页 + 加载/错误/空态）+ ChatPage 头部「Fairy 记住了什么」开关（`aria-expanded`）+ i18n（`memory.self.*`）；文档脊柱：`ARCHITECTURE` §5.4 数据流 + §8 决策 + §9 模块映射、`API_CONTRACT` §3.14 重构（自查 §3.14.1 + admin 列表/创建/更新/删除顺延为 §3.14.2–3.14.5）；测试全绿：shared 93 / api 277 / web 71 + shared/api/web 三包 typecheck + `openspec validate --all` 12/12；真机验收 AC-1~AC-5 全过：user `/me` 只回本人 2 条记忆（对话抽取 + 系统录入，时间倒序，条目无 `userId`/`email`）、`page/limit/kind/keyword` 过滤生效、**越权 `userId`/`email` 参数被剥除结果不变**、admin `/me` 只回自身（空）而 admin 列表仍含全部用户（隔离）、匿名 401、非法 kind 400；自查全程不依赖 LLM/embed key；需求：[2026-09-07-memory-self-inspection.md](docs/requirements/2026-09-07-memory-self-inspection.md)；OpenSpec 归档：[2026-09-07-memory-self-inspection](openspec/changes/archive/2026-09-07-memory-self-inspection/)
- **FU-16 pgvector 记忆向量检索（混合检索 + 写入实时 embed + 幂等回填）**（2026-09-06）— db：`Memory` 增加 `embedding Unsupported("vector(1536)")?` + `add_memory_embedding` 迁移（`CREATE EXTENSION IF NOT EXISTS vector` + 列 + HNSW `memories_embedding_idx USING hnsw (embedding vector_cosine_ops)`，已应用 Neon dev，Prisma 不读写该列、永不下发 DTO）；ai-sdk：`createEmbeddingProvider`（`EMBEDDING_API_KEY` 缺省回退 `OPENAI_API_KEY`、`EMBEDDING_MODEL` 默认 `text-embedding-3-small`、`EMBEDDING_BASE_URL` 回退链、`EMBEDDING_DIMENSIONS=1536`），与聊天供应商解耦（`AI_PROVIDER=deepseek` 也能 embed），无 key → `null` 降级信号，供应商逻辑只在 ai-sdk 内；api：`memory/embeddingClient`（memoize + `embedContent(text) → number[] | null`，维度不符/失败静默仅日志）、`memoryService` 混合检索 `searchMemories(profileId, { query? })`（有 query + embed + 行含向量时 `$queryRaw` cosine 升序 top-N，`profileId` 必填 + `kind`/`keyword` 预过滤 → 不足 limit 按时间倒序补齐排除已召回 id；无 key/embed 故障/维度不符/无向量 → 既有结构化路径，≤limit 与签名不变）、`addMemory`/`createMemory`（FU-14 抽取旁路 + FU-15 admin 新增）落库后实时 embed（raw `UPDATE` 写回，失败静默）、`stateLoop` 传用户消息作语义查询；脚本：`Fairy/scripts/backfill-memory-embeddings.ts`（`pnpm --filter=@fairy/database backfill:embeddings`，只补 `embedding IS NULL` 分批 embed + raw UPDATE、逐条失败不中断、幂等可重跑、打印统计、无 key 提示退出、CI 不执行）；文档脊柱：`ARCHITECTURE` §5.4 数据流/§8 决策/§9 模块映射、`API_CONTRACT` 记忆中心内部说明（embedding 不下发、无公共契约变更）、`apps/api/.env.example` 登记 `EMBEDDING_API_KEY`/`EMBEDDING_MODEL`/`EMBEDDING_BASE_URL`（仅占位）；测试全绿：api 270 / ai-sdk 16 + shared/database/ai-sdk/api/web 五包 typecheck + `openspec validate --all` 12/12；真机验收：默认无 key 回归全链路通过（对话注入命中原记忆「科幻片/太空题材」、admin `/api/memories` 列表正常、SSE 形状不变）+ 真库向量 SQL 冒烟（HNSW 索引存在、cosine 查询零错误）；**配真实 `EMBEDDING_API_KEY` 的端到端验收（真实 embed 落库/语义相似召回/回填脚本幂等）待负责人执行**（见 Risks）；需求：[2026-09-06-pgvector-vector-retrieval.md](docs/requirements/2026-09-06-pgvector-vector-retrieval.md)；OpenSpec 归档：[2026-09-06-pgvector-vector-retrieval](openspec/changes/archive/2026-09-06-pgvector-vector-retrieval/)

- **FU-15 memory-center 二期：记忆管理面（admin REST 记忆端点 + 管理页）**（2026-09-06）— admin-only 记忆管理面：shared `memorySchemas` 二期扩展（`memoryQuerySchema`（page/limit/userId/kind/keyword）、`memoryListItemSchema`（含 email 经 Profile→User join）、`memoryCreateSchema`（userId/kind/content/sessionId?）、`memoryUpdateSchema`（kind?/content? 至少一项）+ 类型 + 测试）；`memoryService` 增加 `listMemories`（分页 + userId/kind/keyword 过滤 + join 带 email + createdAt 倒序 + total）、`createMemory`（复用 `addMemory`，Profile 不存在 404 `PROFILE_NOT_FOUND`）、`updateMemory`（kind/content，404 `MEMORY_NOT_FOUND`）、`deleteMemory`（硬删，404 `MEMORY_NOT_FOUND`）；`routes/memories.ts` 四端点（GET/POST `/` + PATCH/DELETE `/:id`，全部 `requireRole("admin")`，403 `FORBIDDEN`）+ `memoryController` 薄 handlers + app 挂载；web `lib/memoryApi` + `/admin/memories` 管理页（`MemoryAdminPage`：列表 + kind/keyword 筛选 + 分页 + 新增（选用户）/编辑/删除确认 + 加载/错误/空态 + 全中文 i18n）+ 导航「记忆管理」+ 路由 `RequireAuth role="admin"`；手动写入与 FU-14 LLM 抽取**同库同链路**（落库即被下一轮 `searchMemories` 注入）；管理面不依赖 LLM（key 不可用时全功能可用）；无新迁移（既有 `@@index([profileId, kind])` / `@@index([profileId, createdAt])` 满足）；测试全绿：api 255 / shared 87 / web 66（MemoryAdminPage 9）+ 三包 typecheck + `openspec validate --all` 12/12；真机验收 AC-1~AC-7 全过（REST 列表形状/过滤/email/倒序、权限 401→user 403→admin 200、增改删持久化与 400/404 分支、浏览器管理页全流程（导航/筛选/分页/增删改/空态）、非 admin 跳首页、**管理页补录「灯塔/太空」记忆在全新会话被真实 LLM 回复引用**、管理 REST 全程无 LLM 依赖）；需求：[2026-09-06-memory-center-management.md](docs/requirements/2026-09-06-memory-center-management.md)；OpenSpec 归档：[2026-09-06-memory-center-management](openspec/changes/archive/2026-09-06-memory-center-management/)

- **FU-14 memory-center 记忆中心（第一期：结构化记忆落库与检索注入）**（2026-09-06）— `Memory` Prisma 模型 + `MemoryKind` 枚举（PREFERENCE/FACT/INTENT）+ `add_memory_model` 迁移（`@@index([profileId, kind])`、`@@index([profileId, createdAt])`、`@@map("memories")`、Memory→Profile 级联删除）；shared `memorySchemas`（`memoryKindSchema`/`memoryRecordSchema`/`memoryExtractionSchema` + 类型 + 测试）；`memoryService`（`addMemory` 落库 + `searchMemories` profileId 必填隔离 + kind/时间/关键词筛选、限量默认 5）+ `memoryExtractor`（`agent.memory` source：LLM 结构化 JSON 抽取 `{memories:[{kind,content}]}`，sanitize 用户输入 + 低温度，失败/非法 JSON/无 key 一律静默返回空）+ `contextBuilder.buildMemoryBlock` 注入【记忆】区块（≤5 条，无记忆干净省略，替换 `TODO(memory-center)` 纯文本旁路）+ `stateLoop` searchMemories 接线三路 synthesize + chat SSE `done` 后旁路 `extractAndStoreMemories`（void+catch，失败仅记日志不中断流）；测试全绿：api 232 / shared 76 / web 55 + 三包 typecheck + `openspec validate --all` 11/11；真机验收 AC-1~AC-7 全过（真实 LLM 抽取落库 Memory 行且关联 session、**全新会话询问片型 → 回复引用记忆「科幻片/太空题材」跨会话复用**、LLM 故障/无 key 静默降级不崩不漏栈、SSE 流完整、DB 落库/检索按用户隔离）；需求：[2026-09-01-memory-center.md](docs/requirements/2026-09-01-memory-center.md)；OpenSpec 归档：[2026-09-01-memory-center](openspec/changes/archive/2026-09-01-memory-center/)

- **FU-13 旅行规划（第一期：对话行程生成）**（2026-09-01）— `Trip` Prisma 模型 + `add_trip_model` 迁移（`@@index([userId, createdAt])`）+ `TRIP_PLANNED` 行为日志；shared `tripSchemas`（`tripResultSchema`/`tripEventSchema` 等 + 测试）；`amapClient` 服务端高德 Web 服务封装（POI 搜索 + 驾车路线，`AMAP_SERVER_KEY` 注入、缺失/超时/报错一律 `null` 降级不抛错）；`planTripTool`（LLM 草稿 JSON `{destination, itinerary}` + Amap 校验 POI/路线 + 落库，`hasDestinationByRules` 目的地规则兜底——草稿为空且消息无目的地线索 → `unresolved` 反问目的地，有线索 → `TRIP_DRAFT_FAILED`）；agent 链：`plan_trip` 意图（规则先于 LLM）→ planner `{tool:"trip"}` → dispatch（`"unresolved" in result.data` 联合收窄；**身份门禁：行程规划对画像名「铃」与绳匠 admin 开放，其余用户返回 `TRIP_FORBIDDEN` 不调工具，回复婉拒并引导推荐影片、不发 `trip` 事件**）→ synthesize（trip 分支 facts + `{texts, trip}`）+ chat.ts SSE `trip` 事件；web `TripTimeline` 时间轴卡片 + ChatPage 接线 + i18n；`docs/tools.md` 工具注册表；测试全绿：api 213 / web 55 / shared 68 + 三包 typecheck + `openspec validate --all` 10/10；真机验收 AC-1~AC-8 全过（`plan_trip` 识别、SSE trip 事件形状 `{tripId,destination,days,itinerary,route,validated}`、DB Trip 落库 + `TRIP_PLANNED` 日志、无目的地反问、**无 key 降级路径**：行程照常返回 + `validated:false` 不崩不漏栈、chitchat 不建 Trip、SSE done 正常、**铃与 admin 均直接呈现行程 / 普通用户婉拒且无 trip 事件**）；需求：[2026-09-01-travel-planning.md](docs/requirements/2026-09-01-travel-planning.md)；OpenSpec 归档：[2026-09-01-travel-planning](openspec/changes/archive/2026-09-01-travel-planning/)；Trellis task `09-01-fu-13-travel-planning`（已归档）。

- **FU-12 运营洞察 chat 工具（第二期：对话问数）**（2026-09-01）— `storeInsightTool` 零参工具接入 agent 链路：`classifyIntent` 新增 `store_insight` 意图（LLM JSON `topic` + 提示词口语示例；规则兜底 `classifyStoreInsightByRules`，**insight 关键词先于 LLM**——真机验收发现模型严格 JSON 输出不可靠会误判 chitchat，规则命中即返回保证 AC-5 确定性，其余意图仍 LLM 优先）；`planner` 映射 `{ tool: "insight", topic }`；`dispatch` admin 门禁（非 admin 不调用工具直接 `FORBIDDEN`，role 经 chat→stateLoop→dispatch 透传，默认 "user" 保守）；`responseSynthesizer` 按 topic 从完整 overview 切片生成回复（空态 + `INSIGHT_UNAVAILABLE` 降级）；shared `insightTopicSchema`；`docs/tools.md` 工具注册表填充；测试：api 180（22 文件：intentClassifier 22 / planner 4 / toolDispatcher 6 / responseSynthesizer +7 / chat +2）、shared 58 全绿 + 三包 typecheck；真机验收 AC-1~AC-7 全过（admin：最火/库存/趋势/mood/活跃/店况均返回真实数据；user：友好拒绝且工具未调用、SSE done 正常；口语问数全部落 store_insight）；需求：[2026-09-01-store-insight-chat-tool.md](docs/requirements/2026-09-01-store-insight-chat-tool.md)；Trellis task `09-01-fu-12-store-insight-chat-tool`（已归档）。

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

- （待负责人，非开发项）FU-16 真实 embed 端到端验收：配置 `EMBEDDING_API_KEY` 后跑通真实 embed 落库 / 语义相似召回 / 回填幂等，见 Risks。

---

## Next Steps（下一步）

- **（待负责人）FU-16 剩余验收**：配置 `EMBEDDING_API_KEY`（回退 `OPENAI_API_KEY`）后跑通真实 embed 落库 / 语义相似召回 / `backfill:embeddings` 幂等回填（代码与 mock 覆盖已就绪，见 Risks）。
- （二期候选）旅行规划二期：REST `POST /api/trips` + 历史行程回放 + Amap JS 地图叠加路线（本期非目标）。

---

## Risks & Decisions（风险与决策）

### 风险

- **数据库依赖** — 须配置 `DATABASE_URL`（Neon 或本地 PostgreSQL）；`packages/database/.env` 与 `apps/api/.env` 必须同步（见 AGENTS §9）。
- **Neon 冷启动** — Prisma 默认 `connect_timeout` 为 5s，计算休眠唤醒时会报 P1001「Can't reach database server」，管理页看起来像 CRUD 全坏。连接串需带 `connect_timeout=15&pool_timeout=15`，且须同时跑 api:3000 与 web:5173。
- **FU-16 真实 embed 端到端验收待跑（本环境无 OpenAI key）** — 代码、单测（mock embed + raw 伪向量）、默认无 key 回归与真库向量 SQL 冒烟均已通过；但「配 `EMBEDDING_API_KEY` 后真实 embed 落库 / 语义相似召回 / 回填脚本幂等」需负责人配置 key 后在 dev 环境补跑（脚本入口：`pnpm --filter=@fairy/database backfill:embeddings`；无 key 时脚本打印提示退出，不会误调）。
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
| 2026-09-01 | 记忆抽取每轮旁路 + 结构化检索（不依赖 embed） | 用户拍板 + Flores | FU-14：每轮 SSE 后 LLM 抽取（失败静默）→ 落库 `Memory`；下一轮注入 ≤5 条（profileId 隔离 + kind/时间/关键词）。一期不用 pgvector/embed（DeepSeek 不支持 embed）；管理 UI、REST 端点、画像回写为二期。 |
| 2026-09-06 | 记忆管理面 admin-only + 硬删 + 管理独立于 LLM | 用户拍板 + Flores | FU-15：记忆含画像敏感信息，列表/新增/编辑/删除仅对 admin 开放（REST 与 `/admin/memories` 页均 `requireRole("admin")`，user 403/跳首页）；删除为硬删（`Memory` 无外键引用，沿用 movie DELETE envelope）；管理面不调用 AI 供应商，LLM/key 不可用时全功能可用；手动补录与 LLM 抽取同库同链路。pgvector/embedding、用户自查入口、画像回写均推后/非目标。 |
| 2026-09-06 | 向量检索 = 可选 embed 客户端 + 混合检索（FU-16） | 用户拍板 + Flores | `EMBEDDING_API_KEY`（缺省回退 `OPENAI_API_KEY`）/`EMBEDDING_MODEL`（默认 `text-embedding-3-small`，1536 维）独立于聊天供应商（`AI_PROVIDER=deepseek` 也能 embed）；对话注入 `searchMemories(profileId, { query })` 向量为主（cosine top-N + kind/keyword 预过滤）+ 结构化兜底/补齐；无 key/故障/维度不符/无向量 → 全结构化（默认 dev 零变化）；新记忆写入实时 embed + 存量幂等回填；`memories.embedding` 列 raw SQL 读写、永不下发 DTO，公共 API 契约不变。 |
| 2026-09-07 | 偏好记忆反向回写 only `likeGenres` + 增量合并 + 词表白名单（FU-18） | 用户拍板 + Flores | 范围收敛为「抽取候选 → `Profile.likeGenres` 增量沉淀」：一次 LLM 调用在 `memories` 旁同产顶层 `genres`（≤3，仅用户表达影片偏好时输出，提示词不注入 DB 词表）；回写门禁 = 本轮 ≥1 条 preference **落库成功**且候选非空；白名单代码侧过滤（`Movie.genres` distinct + 空/纯数字剔除 + 进程内 TTL 5min，新片型最长延迟 5 分钟可被命中——AC-6 验收用重启清缓存演示）；合并事务内 `Set` 并集、只增不减、无变化不写，与 FU-1 PATCH 手动路径并存（手工加的非白名单标签永不清除）；失败静默与 FU-14 同级，无新端点、无 DB 迁移。 |
| 2026-09-07 | 记忆自查 = 会话页只读面板 + `GET /api/memories/me`（FU-17） | 用户拍板 + Flores | 利用 `Profile.userId` 主键 == `Memory.profileId` 恒等式零迁移落地；`/me` 身份由 token 决定（`res.locals.userId`），条目不带 email/userId；越权 `userId`/`email` 参数由 shared Zod 剥除杜绝跨用户读取；admin 管理面（§3.14.2–3.14.5）保持不变；UI 只读无增删改，来源标注按 `sessionId` 有无推断（对话抽取/系统录入），自查不依赖 LLM/embed key。 |

---

## Last Updated（最近更新）

**2026-09-07** — 工程基建：修复 `Fairy/turbo.json` 的 `pipeline` → `tasks` 字段（turbo 2.0 起 `pipeline` 已改名，此前根脚本 `pnpm dev`/`build`/`test`/`typecheck` 一启动即报 schema 错误，只能退回手工双命令）→ `pnpm dev` 现可经 turbo 一次同时启动 api(:3000) 与 web(:5173)，已真机验证双端口就绪并确认 Ctrl+C 一并停止；AGENTS §8/§9 与 ARCHITECTURE §10 已同步一条命令用法。

**2026-09-07** — FU-18 画像反向回写（偏好记忆自动沉淀 `Profile.likeGenres`，记忆中心五期）：实现完成并验证（shared 96 / api 292 + shared/api typecheck + `openspec validate --all` 13/13）→ 真机验收 AC-1~AC-6 全过（真实 deepseek 对话：`动作` 增量并入且重放幂等、无片型/未命中白名单记忆不写、admin PATCH 的 `喜剧` 标签在合并 `爱情` 后保留、`PATCH /api/profiles` 契约不变、新增 `犯罪` 类型影片经重启清缓存后命中并入）→ 归档（`openspec archive 2026-09-07-profile-writeback --yes`，spec memory-center 已合并）→ 移入 Completed Modules。验收产物已清理、`likeGenres` 还原基线。按「提交三连，不推送」本地提交 `925c457`(feat)/`a546693`(chore)/`96348db`(docs) + `2c6f00a`(journal 哈希回填)，未推送；同日尝试推送时 github.com 不可达，推送延后待网络恢复（origin 停在 `718645a`，后续本地提交一并待推，见 journal Session 18）。

**2026-09-07** — FU-18 画像反向回写：grill-me 收敛（仅 likeGenres / 对话落库旁路 / 增量合并去重 / LLM 抽取 + 影片库类型词白名单；无新公共端点、无 DB 迁移）→ 需求文档 draft 登记 README 索引与 In Progress → 用户批准（OpenSpec 轨）→ OpenSpec 提案 approved → 开始实现。同日推送 origin/master（74 个提交备份，11ac3ec..718645a）。

**2026-09-07** — FU-17 记忆自查入口（会话页只读面板 + `GET /api/memories/me`）：实现完成并验证（shared 93 / api 277 / web 71 + 三包 typecheck + `openspec validate --all` 12/12）→ 归档（`openspec archive 2026-09-07-memory-self-inspection --yes`，spec memory-management 已合并）→ 真机验收 AC-1~AC-5 全过（user `/me` 本人 2 条记忆含「对话抽取/系统录入」两种来源、条目无 email/userId、过滤生效、越权参数被剥除、admin `/me` 仅自身、401/400 分支）→ 移入 Completed Modules。

**2026-09-06** — FU-16 pgvector 向量检索：实现完成并验证（api 270 / ai-sdk 16 + 五包 typecheck + `openspec validate --all` 12/12）；默认无 key 真机回归通过（对话注入命中记忆、admin 列表正常、SSE 不变）+ 真库向量 SQL 冒烟（HNSW 索引存在、cosine 查询零错误）→ 归档（`openspec archive 2026-09-06-pgvector-vector-retrieval --yes`，specs memory-center/ai-provider 已合并）→ 移入 Completed Modules。**剩余：配 `EMBEDDING_API_KEY` 后补跑真实 embed 端到端验收**（见 Risks，脚本 `pnpm --filter=@fairy/database backfill:embeddings`）。

**2026-09-06** — FU-16 pgvector 向量检索：需求文档 approved → OpenSpec 提案 approved → 进入实现（db：embedding 列 + HNSW 迁移已应用 Neon；ai-sdk：可选 embed 客户端 + 测试）。

**2026-09-06** — FU-16 pgvector 记忆向量检索：需求文档 approved → OpenSpec 提案全套 artifacts 完成（proposal / specs(memory-center+ai-provider delta) / design / tasks），待用户批准提案后进入实现（apply）。

**2026-09-06** — FU-16 pgvector 记忆向量检索：grill-me 收敛（混合检索向量为主+结构化兜底、独立可选 `EMBEDDING_API_KEY` embed 配置、一次性幂等回填脚本、纯内部召回升级无公共契约变更）→ 需求文档 draft 登记 README 索引与 Next Steps → 用户批准。

**2026-09-06** — FU-15 memory-center 二期（记忆管理面）：全量验证通过（api 255 / shared 87 / web 66 + 三包 typecheck + `openspec validate --all` 12/12）与真机验收 AC-1~AC-7 全过 → 归档（`openspec archive 2026-09-06-memory-center-management`）→ 移入 Completed Modules。

**2026-09-06** — FU-15 memory-center 二期：grill-me 收敛（admin-only + REST + 管理页；pgvector 推后单独一期）→ 需求文档 draft 登记 README 索引与 Next Steps，待用户批准。

**2026-09-06** — FU-14 memory-center：deepseek 充值后补验 AC-1（真实 LLM 抽取落库 Memory 行）与 AC-3（全新会话回复引用记忆「科幻片/太空题材」）通过 → 归档（`openspec archive 2026-09-01-memory-center`，11/11 spec 校验通过）→ 移入 Completed Modules。

2026-09-01 — FU-14 memory-center：需求批准 → OpenSpec 提案批准 → 实现完成（db/shared/api + 测试全绿），待真机验收与归档。

**2026-09-01**

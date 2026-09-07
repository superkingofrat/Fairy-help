# Journal - Flores (Part 1)

> AI development session journal
> Started: 2026-08-19

---



## Session 1: Movie CRUD MVP delivery and agent norms

**Date**: 2026-08-20
**Task**: Movie CRUD MVP delivery and agent norms
**Branch**: `master`

### Summary

Delivered Movie CRUD (Prisma, REST, admin UI, tests). Fixed local dev pitfalls: sync DATABASE_URL in packages/database/.env and apps/api/.env; run api:3000 and web:5173 together; restart API after env changes. Added AGENTS §15 approval gates and database-guidelines dual-env spec. Archived task 08-19-movie-crud.

### Git Commits

| Hash | Message |
|------|---------|
| `714538b` | (see git log) |

### Status

[OK] **Completed**


## Session 2: Phase 2 落库与仓库安全加固；FU-1 画像写接口全流程交付

**Date**: 2026-08-29
**Task**: Phase 2 落库与仓库安全加固；FU-1 画像写接口全流程交付
**Branch**: `master`

### Summary

Took over the project on ZCode (migrated from Cursor); committed the whole uncommitted Phase 2; fixed repo security hygiene; delivered FU-1 end to end via /opsx:apply and archived it.

### Main Changes

### 改动

- **Phase 2 落库**：发现整个 Phase 2 实现（agent 引擎、推荐/借阅工具、Profile/Rental/BehaviorLog、chat 页）只存在于工作区——git HEAD 里全是 0 字节占位文件，而 PROJECT_STATUS 已写"已交付"。以 `agent: implement phase 2...` 一笔提交（46 文件）。
- **仓库安全加固**：根 `.gitignore` 是 UTF-16 编码，git 完全不解析 → 根 `.env`（真实 DATABASE_URL/OpenAI/Claude key/JWT_SECRET）对 git 裸奔。重写为 UTF-8；逐键比对（值打码）确认根 `.env` 只是 `apps/api/.env` 的过时子集后删除；顺带删除根 helper `package.json`/`pnpm-lock.yaml`/`node_modules` 和 UTF-16 的根 `.env.example`。
- **FU-1 画像写接口与管理 CRUD（OpenSpec 轨）**：`/opsx:apply` 实现 16/16 任务——复数 REST `/api/profiles`（admin 列表按 User 展开、补建 409、PATCH 原子更新、无 DELETE）、shared Zod、`/admin/profiles` 管理页 + i18n、API_CONTRACT §3.8 改复数并新增 `USER_NOT_FOUND`/`PROFILE_ALREADY_EXISTS`。用户验收通过后 `/opsx:archive`：主 spec `user-profile` 同步 7 条需求（撤销"不得提供写 API"禁令），PROJECT_STATUS 更新。

### 验证

- shared 18 / api 40 / web 10 测试全绿（新增 33：schema 11、路由 15、recommend 排序 3、页面 4）；三包 typecheck 通过；`openspec validate` 通过。
- 推荐 PATCH 联动有专门测试：PATCH `likeGenres` 后同 mood/scene 下排序按精确相交翻转。

### 踩坑（下次直接避）

1. **UTF-16 `.gitignore` 会让所有规则静默失效**——ignore 规则"不生效"时先查编码。另外 ZCode 的 Write 工具会保留文件原编码（写完还是 UTF-16），强转 UTF-8 得用 bash heredoc。
2. **状态文档说"已交付" ≠ 已提交**——接手时用 `git cat-file -s` 抽查 HEAD 里关键文件的字节数，0 字节占位一眼识破。
3. **提交前隐私审计套路**：`sed 's/=.*/=<REDACTED>/'` 看键名，跨 env 文件做值包含比对确认冗余后才删；命中"唯一值"先甄别类型（`CLAUDE_MODEL=claude-3-5-sonnet-latest` 是模型名不是凭证，虚惊）。
4. **改 `packages/shared` 后要先 `pnpm --filter=@fairy/shared build`**——apps 的 typecheck 解析的是 dist，不重建会报"has no exported member"（AGENTS §9 有写，实操还是踩了）。
5. **Vitest + RTL 未开 globals 时无自动 cleanup**——同文件多个 render 会 DOM 叠加导致 "Found multiple elements"；`afterEach(cleanup)` + 优先用 role 查询（heading 与 button 区分）。

### 下一步

- FU-2 真实 LLM 替换规则意图与模板回复（OpenSpec 轨；届时按 AGENTS §12 把 provider key 变量名登记进 `apps/api/.env.example`）。
- `学习过程.md` 有未提交改动（用户个人笔记），保持不动由用户处置。



### Git Commits

| Hash | Message |
|------|---------|
| `361d0a6` | (see git log) |
| `218832f` | (see git log) |
| `89ec6c5` | (see git log) |
| `d104dd3` | (see git log) |
| `8e73de6` | (see git log) |
| `a98a159` | (see git log) |
| `f1d7667` | (see git log) |

### Status

[OK] **Completed**


## Session 3: FU-2 真实 LLM 交付：ai-sdk 三供应商 + 意图/回复 LLM 化 + 规则降级

**Date**: 2026-08-29
**Task**: FU-2 真实 LLM 交付：ai-sdk 三供应商 + 意图/回复 LLM 化 + 规则降级
**Branch**: `master`

### Summary

Delivered FU-2 end to end through the OpenSpec gates (approve -> propose -> review -> apply -> accept -> archive); built @fairy/ai-sdk from zero and swapped rule/template agent internals for LLM with graceful fallback.

### Main Changes

### 改动

- **`@fairy/ai-sdk` 从零落地**：统一 `chat()/stream()/embed()` 接口 + usage 元数据；DeepSeek（默认 `deepseek-v4-flash`，OpenAI 兼容 adapter，与 OpenAI 共用同一 adapter 换 baseURL）、OpenAI、Claude 三家纯 fetch 实现；类型化错误（MISSING_API_KEY/UNKNOWN_PROVIDER/TIMEOUT/HTTP_5XX/RATE_LIMITED/PARSE/EMBED_UNSUPPORTED，不泄漏供应商响应体）；env 工厂（AI_PROVIDER/AI_MODEL/AI_TIMEOUT_MS）；移除脚手架遗留、从未使用的 `openai` npm 依赖（零新增依赖）。
- **agent LLM 化**：`llmClient`（缓存 provider、`tryChat -> null` 统一降级信号、输入清洗）；意图 = LLM 结构化 JSON（zod 校验，借片只产片名走 title-match，LLM 永不产 movieId，非枚举口语如「emo→致郁」映射，新增 chitchat 不调工具）；回复 = LLM 只引用工具观察事实 + profile（防幻觉），Phase 2 模板整体保留 fallback；`stateLoop` 单次读 profile 共享。
- **OpenSpec 全流程**：需求批准 → propose（新能力 ai-provider + agent-chat MODIFIED/ADDED delta）→ 用户审阅后 apply → 真机验收（DeepSeek 走通「emo 推荐」与「借千与千寻」库存事务）→ archive；主 specs 同步（ai-provider 新建 3 条、agent-chat 扩到 6 条）。

### 验证

- 四包 98 测试全绿（ai-sdk 13 + api 57 + web 10 + shared 18），四包 typecheck 通过；原 7 个路由测试零改动通过——测试环境无 key 自动走降级路径，等价于降级验收的自动化版；SSE 事件名/负载形状与 Phase 2 契约完全一致，前端零改动。

### 踩坑（下次直接避）

1. **上轮回滚的三个笔误本源**：测试文件导入路径写错（`../factory` 应为 `./factory`）、跨 describe 引用作用域变量、未使用的 import——重写时先想清楚文件位置再动手。
2. **`pnpm typecheck | tail` 的退出码是 tail 的**——`&&` 链上的 `echo ✅` 在 typecheck 失败时也会打印；要单独 `echo exit=$?`。
3. **openspec validate 的 MODIFIED 规则**：MODIFIED 块必须携带原 requirement 的全部场景且场景名不能改，否则 archive 拒绝（丢场景 = 拒绝静默丢失）。
4. **工具机制两连**：0 字节占位文件和 `git restore` 过的文件都要先 Read 再 Write/Edit，否则工具直接拒绝。
5. **测试失败先甄别是产品 bug 还是场景设计错**：LLM 片名「星际穿越」精确命中一部 → 正确 borrow；要测「不唯一」场景得用部分匹配（如「星际」命中两部）。
6. **联调前提**：用户在 `apps/api/.env` 补 `DEEPSEEK_API_KEY` 后必须重启 API（§9 惯例）；无 key 时全链路自动降级，开发与 CI 完全不依赖真 key。

### 下一步

- FU-3 BehaviorLog 查询与流水 UI（小切片，按 §15 可能走 Trellis 轨，比 OpenSpec 轻）。
- `学习过程.md` 仍是用户未提交的个人笔记，保持不动。



### Git Commits

| Hash | Message |
|------|---------|
| `58cbd61` | (see git log) |
| `40c3036` | (see git log) |
| `51f3a97` | (see git log) |

### Status

[OK] **Completed**


## Session 4: FU-4 归还交付与验收期 P0/P1 修复（枚举迁移延迟部署 + SSE 流内降级）

**Date**: 2026-08-30
**Task**: FU-4 归还交付与验收期 P0/P1 修复（枚举迁移延迟部署 + SSE 流内降级）
**Branch**: `master`

### Summary

Delivered FU-4 chat-text return end to end (scope split: button UI deferred to FU-8), then root-caused and fixed the acceptance hang (undeployed enum migration) and hardened the SSE error path; backfilled 3 lost log rows.

### Main Changes

### 改动

- **FU-4 归还（聊天文本）**：`returnRental` 事务（findFirst ACTIVE → 置 RETURNED → 库存 increment，`RENTAL_NOT_FOUND` 幂等）、`returnMovieTool` + `RETURN_SUCCESS` 行为日志（枚举迁移 `add_return_success_action`）、return 意图（LLM 结构化 + 规则「还」+唯一片名分支，hái/huán 歧义双保险）、SSE 新 `return` 事件、unresolved 回复列出所借影片。**用户拍板拆分**：一键归还按钮 + `GET /api/rentals` + chat action 参数整体拆至 FU-8（占位需求已建，排 FU-6 后）——按钮对核心是单向依赖，拆出后 web 零改动、diff 减半。
- **验收期 P0/P1 修复**（用户报告"还片一直发送中"+"还盗梦空间显示没有借阅记录"）：只读查库定位为**一个根因两个症状**——枚举迁移延迟部署：归还事务先提交（三笔全部实际成功、库存正确回补），随后写 `RETURN_SUCCESS` 日志撞上 DB 不存在的枚举值 → 抛错 → SSE 头已发 → Express 错误处理器对已开的流写 JSON → 前端永久"发送中"；重试报 RENTAL_NOT_FOUND 是幂等正确输出。修复：A) `prisma migrate deploy`（P0）；B) chat 路由流内降级（headersSent 后写友好 text + done + end，P1 用户敲定）。
- **数据回填**（用户选 b）：三笔丢失的归还日志按 rental.updatedAt（=归还时刻）回填，幂等谓词按 rentalId 匹配已有日志；回填后 RETURN_SUCCESS 共 4 条，流水页完整。

### 验证

- 四包 129 测试全绿（api 85），typecheck 四包通过；真机验收：借 → 还 → 库存回补 → 可再借；迁移部署后枚举实测入库；回填后流水页 4 条归还记录。

### 踩坑（下次直接避）

1. **迁移文件落了 ≠ 迁移生效**：Neon 冷启动让 deploy 失败时按预案"只落文件留联调"，结果欠账以隐蔽形式爆雷——事务成功、日志写入才炸、UI 悬挂而非报错。联调 checklist 应加一条：`prisma migrate status` 确认无 pending 再开测。
2. **SSE 端点必须在 headersSent 后自兜底**：异常时错误中间件写 JSON 无效，前端永久等 done。任何流式端点都要有"流内降级"分支（友好 text + done + end）。
3. **部分失败时序**：事务先提交、后置步骤（日志）失败 → 业务生效但可观测性丢失，重试报"不存在"像 bug 实为幂等正确。排查顺序：先只读查 DB 实况，再解释 UI 症状。
4. **prisma generate EPERM（DLL 被 dev server 锁）但 TS 类型已写完**——引擎未变时无害，typecheck 可继续；引擎步骤失败不影响生成产物正确性。
5. **回填语义**：rental.updatedAt 即归还发生时刻（该行创建后唯一一次更新）；幂等回填按 rentalId 对账。
6. openspec MODIFIED 场景保全规则本次一次过（上轮 FU-2 的教训生效）。

### 下一步

- FU-5 真实 JWT（用户已实际感知"点进去就是 admin"）；FU-6 REST borrow；FU-8 一键归还 UI（grill-me 后实施）；FU-7 Session 历史。
- `学习过程.md` 仍为用户个人笔记未提交，保持不动。



### Git Commits

| Hash | Message |
|------|---------|
| `956f60b` | (see git log) |
| `da84300` | (see git log) |
| `5f10e25` | (see git log) |
| `a2a84cc` | (see git log) |

### Status

[OK] **Completed**


## Session 5: FU-5 真实 JWT 认证交付（仅登录）：stub 移除 + 全栈身份改造

**Date**: 2026-08-31
**Task**: FU-5 真实 JWT 认证交付（仅登录）：stub 移除 + 全栈身份改造
**Branch**: `master`

### Summary

Delivered FU-5 end to end: JWT login replacing the dev stub across api and web, including full test-header migration and login page with guards; acceptance passed after fixing Neon connectivity flakiness.

### Main Changes

### 改动

- **DB**：User 增加 `passwordHash`（迁移文件入库；Neon 休眠按预案未即时 deploy）；seed 用 bcryptjs 写入两个种子用户的固定开发密码（demo-only 注释，上线前必须改密）。
- **API**：`POST /api/auth/login`（bcrypt 校验、统一 401 防用户枚举、HS256 12h token）+ `GET /api/auth/me`；`authMiddleware` 重写为 Bearer-only——`X-Dev-Role`/`Bearer dev-*` 彻底移除；`JWT_SECRET` 启动必填校验（index.ts，缺失拒绝启动）。
- **Web**：authStore（zustand persist）+ authApi + `/login` 页 + 路由守卫（/chat 需登录、/admin/* 需 admin）+ 4 个 API client 注入 Bearer 且 401 自动清会话跳登录 + 角色化导航（admin 链接仅 admin 可见）+ 退出按钮。
- **测试迁移**：`authHeader(role)` 助手（导入时注入测试 JWT_SECRET），4 个测试文件 49 处 stub 头批量迁移，全部既有测试逻辑不变。

### 验证

- 五包 typecheck 通过；138+ 测试全绿（api 89 / web 18 / shared 18 / ai-sdk 13）；真机验收：两账号登录、chat 借还身份=登录者、admin 页管理、未登录跳转、退出。

### 踩坑（下次直接避）

1. **Neon 连接抖动的应对姿势**：CLI（migrate deploy/status）与 engine 直连时好时坏，单次失败不代表死——**带间隔的重试循环**（3-4 次 × sleep 15s）最终全部跑通；"No pending migrations" 说明其实第一次就成功了。
2. **pnpm --filter exec 报 "Command prisma not found"** 是底层 prisma 进程死亡后的误导性包装——直接 `npx prisma ...` 更可靠。
3. **加 NOT NULL 列到非空表必须带 DEFAULT**：`passwordHash String @default("")` —— 空哈希即"未设密码"（bcrypt.compare 对空串必失败），迁移与语义双安全。
4. prisma generate EPERM（DLL 被运行中的 dev server 锁）两次验证均为良性：**TS 类型/运行时 index.js 先落盘，仅引擎二进制改名失败**——引擎版本未变时无害。
5. chat 说话人真实化后，演示"铃"的画像需用 user@fairy.local 登录——seed 账号与画像的绑定关系要写进联调提示。

### 下一步

- FU-6 REST `POST /api/borrow` → FU-8 一键归还 UI（grill-me 后）→ FU-7 Session 历史。
- 挂账：登录限速；注册/建号流程；refresh token；种子固定密码上线前必须改密。



### Git Commits

| Hash | Message |
|------|---------|
| `0182cb4` | (see git log) |
| `3e90280` | (see git log) |
| `35c72a2` | (see git log) |

### Status

[OK] **Completed**


## Session 6: FU-6 REST 借阅交付：REST 端点复用 chat 事务 + 全流程归档

**Date**: 2026-09-01
**Task**: FU-6 REST 借阅交付：REST 端点复用 chat 事务 + 全流程归档
**Branch**: `master`

### Summary

Delivered FU-6 end to end: POST /api/borrow sharing the borrowMovieTool transaction with the chat path; acceptance passed and archive completed with movie-rental main spec sync.

### Main Changes

### 改动

- **FU-6 REST 借阅接口**：`POST /api/borrow`（Bearer-only、body `{ movieId }`、借阅人=token subject、body 内 `userId` 忽略、201 `{rentalId, remainingStock}` / 404 `MOVIE_NOT_FOUND` / 409 `ALREADY_BORROWED` / 409 `OUT_OF_STOCK` / 400 `VALIDATION_ERROR` / 401）。系列里最轻的一个 FU：路由薄层直接复用 `borrowMovieTool`——同一事务 + 同一行为日志，**零新借阅逻辑**；共享 `borrowRequestSchema`（movieId: uuid）；`rentalsRouter` 占位原样留给 FU-8。
- **测试**：7 个路由测试（成功断言工具收到 token subject、body userId 越权字段忽略、404、409×2、400、401）。
- **文档**：API_CONTRACT 新增 §3.10 REST 借阅 + 从 §5 移除预留；ARCHITECTURE §8 决策行修订为「库存写入统一经 `rentalService.borrow`，chat 工具与 REST 只是两个传输口」+ §5.2 双入口标注。
- **归档**：主 spec `movie-rental` 同步新增「REST borrow endpoint shares the rental transaction」需求（3 scenarios 全保）；change dir 移入 `archive/2026-09-01-fu-6-rest-borrow`；PROJECT_STATUS 更新（FU-6 → Completed，Next Steps 剩 FU-8/FU-7）。

### 验证

- 四包 145 测试全绿（api 96 / web 18 / shared 18 / ai-sdk 13）+ 五包 typecheck 通过 + `openspec validate` 通过；web 零改动回归确认。
- 真机验收点（AC-5）：REST 借一部 → chat「还 X」→ 两入口共享同一数据；用户已验收通过。

### 踩坑（下次直接避）

1. **archive 前 sync 比对别用 `grep | head` 判断**——退出码是 head 的（恒 0），匹配与否被吞掉；用 `grep -c` 或列主 spec 需求头列表对账。本次差点误判"已同步"。

### 下一步

- FU-8 一键归还 UI（grill-me 后实施：GET /api/rentals + chat action 参数 + 按钮）；FU-7 Session 历史。
- 挂账：登录限速；注册/建号流程；refresh token；种子固定密码上线前必须改密。


### Git Commits

| Hash | Message |
|------|---------|
| `86fd91a` | (see git log) |
| `ecc0c3a` | (see git log) |

### Status

[OK] **Completed**


## Session 7: Session 7: FU-8 one-click return UI delivery and archive

**Date**: 2026-09-01
**Task**: Session 7: FU-8 one-click return UI delivery and archive
**Branch**: `master`

### Summary

Delivered FU-8 end to end: one-click return UI (GET /api/rentals + chat action deterministic return + rentals strip/card toggle). Acceptance passed; archive completed with movie-rental main spec sync.

### Main Changes

### Summary

Delivered FU-8 end to end: one-click return UI — `GET /api/rentals` query endpoint + chat `action: "return"` deterministic path + chat page rentals strip / card borrow-return toggle. Acceptance passed; archive completed with movie-rental main spec sync.

### Main Changes

### 改动

- **FU-8 一键归还 UI**：`GET /api/rentals`（Bearer-only、本人或 admin `?userId=` 代查、`?status=ACTIVE` 过滤、行形状含 `movieTitle`、403/404/400/401 错误映射、无分页）；chat 请求新增 `action: "return"` + `movieId`（refine 强制成对，缺一 400）确定性归还——绕过 LLM 意图分类，直接复用 `returnMovieTool` + `synthesize` 归还分支，**零新增回复逻辑**，与文本「还 X」共用同一事务与日志；chat 页「我的借阅」条（空态整条隐藏）+ 推荐卡片借/还切换（归还按钮 stock=0 也可用）；SSE `return` 成功乐观移除 / 失败刷新。
- **测试**：shared 3（action 校验）、api 11（rentals 8 + chat 3）、web 5（条渲染/隐藏、归还点击载荷、卡片切换）；19/19 任务勾选。
- **文档**：API_CONTRACT §3.7 请求体加 `action` 字段 + §3.11 GET /api/rentals + §4 错误码「未来 REST」标注修正；ARCHITECTURE §5.5 一键归还路径 + §8 新增「租借记录只有只读查询端口」决策。
- **归档**：主 spec `movie-rental` 同步新增 3 个 ADDED 需求（Rental list queryable / One-click return deterministic / Chat page surfaces active rentals，共 9 scenarios 全保）；change dir 移入 `archive/2026-09-01-fu-8-return-button-ui`；PROJECT_STATUS 更新（FU-8 → Completed 顶部，Next Steps 剩 FU-7/挂账）。

### 验证

- 四包测试全绿（shared 21 / api 107 / web 23）+ 三包 typecheck + `openspec validate` 通过。
- 真机验收点 AC-1~AC-6（条显示/隐藏、归还确认+库存回补、卡片借还切换、重复归还道歉无 500、admin 代查、REST 借入后按钮还与文本还共用日志）——用户已验收通过。

### 踩坑（下次直接避）

1. **archive 同步 delta spec 别用 `tail -n +4` 接**——`## ADDED Requirements` + 空行占 3 行，需求标题在第 3 行，`+4` 会把第一段需求标题吃掉，正文和 scenarios 变成无头孤儿段。append 后立刻 `grep -n '^### Requirement'` 对账需求头数量（本次 7 → 应为 8，已补回）。

### 下一步

- FU-7 Session 历史；FU-9 影片库浏览页 + 直接借阅（grill-me 已开启）。
- 挂账：登录限速；注册/建号流程；refresh token；种子固定密码上线前必须改密。


### Git Commits

| Hash | Message |
|------|---------|
| `3e363df` | (see git log) |
| `a8ea7cd` | (see git log) |

### Status

[OK] **Completed**


## Session 8: FU-9 movie library page delivery and archive

**Date**: 2026-09-01
**Task**: FU-9 movie library page delivery and archive
**Branch**: `master`

### Summary

Delivered FU-9 end to end: /movies library page with REST borrow and borrowed marking; return kept chat-only. Acceptance passed; archive completed with movie-rental main spec sync.

### Main Changes

### 改动

- **FU-9 影片库浏览页 + 直接借阅（纯 web，OpenSpec 轨）**：新增 `/movies` 导航页（MovieLibraryPage + 独立 MovieCard）——目录分页 + mood/scene chips + 关键词搜索（筛选即搜）；借阅按钮直调既有 `POST /api/borrow` REST 端点（`movieApi.borrowMovie`，类型化 `ApiRequestError` 按 code 映射 i18n 文案）；已借标记来自既有 `GET /api/rentals?status=ACTIVE`（refreshRentals → Set，借出卡片按钮禁用置灰）；**归还仍只经 chat 工具链**（双写禁令在 spec/测试双面强化：`queryByText("归还")` 断言为 null）。后端零改动——所有端点均系 FU-2/FU-6/FU-8 已有，本次仅编排 web 侧。
- **测试**：web 31/31 全绿（新增 MovieLibraryPage.test.tsx 7 个：目录渲染、筛选组合请求、重置回目录、借阅成功、code 冲突文案、已借禁用、无归还控件；App.test.tsx 补 `/movies` 路由与导航链接断言）。
- **归档**：主 spec `movie-rental` 同步新增 2 个 ADDED 需求（Library page lists catalog with filters and direct borrow / Library page marks actively borrowed titles，7 scenarios 全保，总量 8 → 10）；change dir 移入 `archive/2026-09-01-fu-9-movie-library-page`；PROJECT_STATUS 更新（FU-9 → Completed 顶部，Next Steps 剩 FU-7/挂账）。

### 验证

- web 31/31 + 三包 typecheck + `openspec validate` 通过；`openspec status` 4/4 artifacts done、13/13 任务勾选。
- 真机验收点：/movies 目录浏览、筛选组合、借阅成功库存回补、已借卡片禁用、无归还入口——用户已验收通过。

### 踩坑（下次直接避）

1. **`vi.mock` automock 会吞掉自建错误类字段**——`ApiRequestError` 被替换成空 vi.fn() 后 `code`/`message` 全丢，测试渲染出兜底文案而不是预期 code 文案；构造带 code 的错误要用原生 `Error` + 类型断言再赋值 `error.code`。
2. **Vitest 未加载 jest-dom matchers**——`toBeDisabled` 是无效 Chai property（不报错但恒 pass）；用 `(el as HTMLButtonElement).disabled` 直接断言。
3. **Windows 下 python 读不到 Git Bash 的 `/tmp`**——临时 JSON 指令文件放本地相对路径，不要走 `/tmp`。
4. **archive 同步 delta 用 `tail -n +3` 接**（Session 7 教训 +4 吞标题）——append 后立刻 `grep -n '^### Requirement'` 对账需求头数量（本次 10，全保）。

### 下一步

- FU-7 Session 表与对话历史回放。
- 挂账：登录限速；注册/建号流程；refresh token；种子固定密码上线前必须改密。


### Git Commits

| Hash | Message |
|------|---------|
| `479b17b` | (see git log) |
| `1a25eac` | (see git log) |

### Status

[OK] **Completed**


## Session 9: FU-7 session table and chat history replay delivery and archive

**Date**: 2026-09-01
**Task**: FU-7 session table and chat history replay delivery and archive
**Branch**: `master`

### Summary

Delivered FU-7 end to end: Session/ChatMessage persistence, /api/sessions CRUD, chat side-channel appendTurn, 10-message history injection, web session sidebar with replay and reload restore. Fixed an SSE-header regression. Acceptance AC-1~AC-7 passed; archived with new chat-session main spec.

### Main Changes

### 改动

- **FU-7 Session 表与对话历史回放（OpenSpec 轨）**：`Session`/`ChatMessage` Prisma 模型 + 迁移（`role` 枚举、`payload` JSON、`sessionId`/`createdAt` 索引）；shared 新增 `sessionSchemas`/`sessionTypes`（`chatEventSchema` 统一 recommendation/borrow/return 事件形状，`chatMessageDto` 带 payload 回放，`sessionListItem` 含 messageCount）。
- **API**：`sessionService`（createSession/listSessions/getOwnedSession/getSessionMessages/getRecentMessages/appendTurn——事务内写标题 + USER + ASSISTANT 两条消息，标题首条消息前 20 字派生，失败仅记日志不中断 SSE 旁路）；`/api/sessions` 三端点（POST 201 / GET 列表按 `updatedAt` 倒序含消息数 / GET `:id` 回放）；`chatRequestSchema` 可选 `sessionId`（return 请求豁免）；404 `SESSION_NOT_FOUND` / 403 `SESSION_FORBIDDEN` 在 SSE 之前返回；`done` 事件携带 `sessionId`；`contextBuilder.buildConversationHistory` 注入最近 10 条纯文本（`TODO(memory-center)` 技术债）。
- **Web**：`sessionApi` + ChatPage 会话侧栏（新建/切换/恢复）、历史回放（文本 + 推荐卡 + 借还事件走同一渲染路径、刷新后重取）、i18n 补全。
- **修复一个真回归**：chat.ts 的 SSE headers 曾移到 `runChatTurn` 之后（为了流前 JSON 404/403），导致流内工具错误从「text+done 优雅降级」变成 500 JSON——已恢复为先设置 SSE 头 + 内层 try/catch，降级契约回归。
- **测试**：api 135/17 文件（新增 sessionService 8、sessions routes 5、contextBuilder 1，chat +6）、web 36（ChatPage 12）、shared 36（sessionSchemas 12、chatSchemas +3）全绿。
- **归档**：主 spec `chat-session` 全新创建（Purpose 逐字 + 4 条 ADDED 需求并入 `## Requirements`）；change dir 移入 `archive/2026-09-01-fu-7-session-history`；PROJECT_STATUS 更新（FU-7 → Completed 顶部，In Progress 清空）。

### 验证

- 四包测试全绿 + 三包 typecheck + `openspec validate --all` 8/8；`openspec status` 4/4 artifacts done、15/15 任务勾选。
- 真机验收 AC-1~AC-7 全过：新建/自动标题、跨登录回放、刷新恢复（等 ~10s 冷启动后完整回放）、回放卡借阅落当前会话、跨用户 403/无 token 401、续聊 messageCount 2→4、admin 全链路（登录→管理页→会话区发消息）。用户已验收通过。

### 踩坑（下次直接避）

1. **Windows Git Bash + curl 中文乱码**——`curl -d` 带中文经 ANSI 代码页变 `\ufffd` mojibake（验收期产生 2 条脏会话已删）；API 验收一律用 python urllib UTF-8。
2. **`$transaction` mockImplementation 类型不匹配**——回调参数签名报 TS2345，直接照抄 `rentalService.test.ts` 的 `(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as unknown as typeof prisma.$transaction` cast。
3. **Neon 冷启动让「刷新恢复」看起来像 bug**——刷新后 2.5s 快照仍是空状态，等 ~10s 消息才回放；验收观察窗口要 >10s 再下结论。
4. **locator 歧义**——`getByRole("article")` 匹配「海蒂」时同时命中「海蒂和爷爷」；用 `filter({ has: heading exact })` 定位。
5. **会话 fixture 标题真值陷阱**——`sessionRow.title="雨天"` 是 truthy，derive-title 测试需 mock 空标题，否则断言错位。
6. **SSE 头顺序回归**——为流前 JSON 错误把 headers 移到 turn 处理之后，会破坏「流内错误降级 text+done」契约；两个诉求要靠先设头 + 内层 try/catch 同时满足。

### 下一步

- 挂账：登录限速；注册/建号流程；refresh token；种子固定密码上线前改密。
- memory-center 技术债：续聊最近 10 条历史注入（`contextBuilder.ts` 内联查询）待记忆中心统一替换。


### Git Commits

| Hash | Message |
|------|---------|
| `e9fe777` | (see git log) |
| `974fad8` | (see git log) |

### Status

[OK] **Completed**


## Session 10: FU-10 账号体系闭环交付与归档

**Date**: 2026-09-01
**Task**: FU-10 account closure (register / rate limit / refresh token) delivery and archive
**Branch**: `master`

### Summary

Delivered FU-10 end to end: self-service registration (role=user, register-and-login), login/register IP rate limiting, refresh token rotation + reuse revocation. Tests green across shared/api/web, spine docs updated, live HTTP + browser + rate-limit acceptance all passed; archived with user-auth main spec merged.

### Main Changes

### 改动

- **注册 `POST /api/auth/register`（OpenSpec 轨）**：仅开放 `role=user`（admin 仅 seed），bcrypt cost 10，201 返回 `{ token, refreshToken, user }` 注册即登录；409 `EMAIL_ALREADY_EXISTS` / 400 `VALIDATION_ERROR`；shared 新增 `registerSchema`/`refreshTokenSchema` + 测试。
- **登录/注册限流**：express-rate-limit（login 10 次/15 分钟、register 20 次/小时、429 `TOO_MANY_REQUESTS`）；限流器在 `createApp()` 内创建保证测试隔离；生产反代后须 `trust proxy`。
- **refresh token 旋转 + 复用吊销**：`RefreshToken` 表只存 sha256 哈希（随机 48B base64url）、30 天过期；旋转在 `$transaction` 内置旧 `revokedAt`+`replacedByTokenId` 并新建；复用已吊销 token → 401 `INVALID_REFRESH_TOKEN` 并吊销该用户全部 refresh token；`POST /api/auth/logout` 吊销当前 token；login 响应新增 `refreshToken`。
- **Web**：`RegisterPage` + `/register` 公开路由 + 登录页注册链接、authStore `refreshToken` 持久化、`lib/http.ts` 统一认证客户端（401 单飞刷新 → 重试一次 → 刷新失败才 `clear()`+跳 `/login`）、movieApi/profileApi/sessionApi/behaviorApi/rentalsApi 迁移（导出签名不变）、chatApi SSE 保持原样（401 仍直接清登录，注明取舍）。
- **测试**：api 145（auth 14：register 201/409/400、login 带 refreshToken、rotation、复用→全家吊销、过期、logout 幂等、第 11 次 429）、web 47（RegisterPage 4、http 单飞刷新 6、LoginPage/App 更新）、shared 47（authSchemas 11）。
- **归档**：user-auth 主 spec 合并 MODIFIED/ADDED 需求（含 web 路由守卫单飞刷新场景）；change dir 移入 `archive/2026-09-01-fu-10-account-closure`；PROJECT_STATUS 更新（FU-10 → Completed 顶部，In Progress 清空）。

### 验证

- 三包 typecheck 干净 + 测试全绿（api 145 / web 47 / shared 47）+ `openspec validate --all` 8/8（change 归档后并入主 spec 项）。
- 真机 HTTP 11/11：register 201/409/400、login 带 refreshToken、refresh 旋转、复用旧 token → 401 且新 token 也死（全家吊销）、登出后 refresh 401、ghost token 401。
- 浏览器 E2E：注册即自动登录 `/chat`（user 角色导航）、重复邮箱「该邮箱已注册」、短密码/两次不一致前端校验、登录页「还没有账号？注册一个」链接、登录成功。
- 限流实测：窗口内第 11 次起 429（前 10 次 401/200），`touch` API 源文件 reload 后限流器重置恢复 200。

### 踩坑（下次直接避）

1. **`@fairy/shared` 未 build 导致 api 测试 `safeParse` undefined**——新增/修改 shared schema 后必须先 `pnpm --filter=@fairy/shared build` 再跑 api/web 测试，否则 dist 里没有新 schema。
2. **`git mv` 对 untracked 文件失败**——change 目录从未提交时（`??`），归档直接用 `mv` 移动文件即可，随 archive 提交一起 add；`git mv` 会报 "not under version control"。
3. **浏览器 strict mode 定位歧义**——`getByLabel("密码")` 同时命中「密码」「确认密码」；用 `{ exact: true }`。
4. **express-rate-limit v8 API 变更**——named export `rateLimit`、`limit` 选项（非 v7 `max`）；限流器必须在 `createApp()` 内创建，否则单例计数跨测试串扰。
5. **限流验收会耗尽 budget**——先做 register/refresh/logout 的 curl 验收，login 调用最小化，最后做限流测试；`touch` API 源文件 reload 可重置 in-memory 计数。
6. **`http.test.ts` mock 参数类型**——`fetchMock.mock.calls[0]` 需给 mock 声明 `(_input, _init?)` 签名，否则被推断为 `[]` 导致 TS2352。
7. **Windows curl 中文乱码**——验收继续用 python urllib UTF-8（同 FU-7）。

### 下一步

- 种子固定密码上线前改密（FU-5 挂账，仍待处理）。
- store insights 运营看板（`storeInsightTool` 0 行）、旅行规划（`amapClient`/`planTripTool` 0 行）挂账。
- memory-center 技术债：续聊最近 10 条历史注入（`contextBuilder.ts` 内联查询）待记忆中心统一替换。

### Git Commits

| Hash | Message |
|------|---------|
| `70a9afc` | (see git log) |

### Status

[OK] **Completed**


## Session 11: FU-11 store insights dashboard (admin overview + /admin/insights page) delivery and archive

**Date**: 2026-09-01
**Task**: FU-11 store insights dashboard (admin overview + /admin/insights page) delivery and archive
**Branch**: `master`

### Summary

Delivered FU-11 end to end: admin-only /api/insights/overview aggregation + /admin/insights dashboard page. Tests green (api 154 / web 50 / shared 56), live HTTP + browser acceptance AC-1~AC-8 all passed, archived with store-insights main spec.

### Main Changes

## Session 11: FU-11 运营洞察看板交付与归档

**Date**: 2026-09-01
**Task**: FU-11 store insights dashboard (admin overview + /admin/insights page) delivery and archive
**Branch**: `master`

### Summary

Delivered FU-11 end to end: admin-only `GET /api/insights/overview` aggregation endpoint (popular top 5, 14-day zero-filled borrow/return trend, inventory + low-stock `stock ≤ 1`, mood/scene 30-day top 5, activity) and the `/admin/insights` dashboard page (pure-CSS cards/bars, loading/error/empty states, i18n). Tests green across shared/api/web, spine docs updated, live HTTP + browser acceptance all passed (AC-1~AC-8); archived with store-insights main spec created.

### Main Changes

### 改动

- **shared 契约**：`insightSchemas.ts` 7 个 schema + 类型（`storeInsightsOverview` 及行类型 `popularMovieItem`/`dailyBorrowPoint`/`lowStockMovieItem`/`moodSceneCount`/`activityOverview`/`inventoryStatus`），经 `schemas/index.ts` 导出 + 3 个 schema 测试。
- **API 聚合 `GET /api/insights/overview`（admin-only）**：`insightService.getStoreInsightsOverview` 一次返回看板全部卡片——热门影片 TOP 5（按 RECOMMEND `payload.movieIds` 统计推荐次数）、借阅/归还 14 天趋势（服务器本地日期分桶、缺日补 0）、库存状态（available/outOfStock + 低库存 `stock ≤ 1` 列表）、mood/scene 30 天分布 TOP 5、活跃概况（totalUsers/activeUsers/newUsers7d/borrows7d）；11 个 Prisma 查询 `Promise.all` 并行规避 Neon 冷启动串行延迟。路由挂 `authMiddleware` + `requireRole("admin")`（user 403 `FORBIDDEN`、无 token 401 `UNAUTHORIZED`）。
- **Prisma groupBy 类型坑修复**：`_count` 结果类型为 `true | {...}` 联合需 cast；`orderBy: { _count: { _all } }` 在 Prisma 5.17 非法（`RentalCountOrderByAggregateInput` 无 `_all`），改为按具体列 `movieId` 排序（非空必填列，等价于 _all）。
- **Web `/admin/insights` 看板页**：`InsightsAdminPage` 纯 CSS 卡片与条形图（不引图表库）、统计卡 5 张、热门影片/低库存表格、14 天趋势双色条形（indigo 借阅/emerald 归还 + 图例）、mood/scene 分布列表、刷新按钮；加载/错误/空态齐全；`insightApi.ts` 走 `request()` 认证客户端；admin 导航 + 路由（`RequireAuth role="admin"`，user 跳转首页）；i18n `insights.*` keys（修复「心情 · 心情 / 场景分布」标题重复 → 拆独立 distribution key）。
- **测试**：api 154（insightService 6：空数据/缺日补 0/TOP 排序；insights routes 3：admin 200 / user 403 / 无 token 401）、web 50（InsightsAdminPage 3：渲染/空态/错误态；App 更新）、shared 56（insightSchemas 3）。
- **文档**：API_CONTRACT §3.13（端点 + 成功 JSON + 401/403 错误表 + 低库存阈值标注）、ARCHITECTURE §5.7 数据流 + §8 两条决策 + §9 模块映射、PROJECT_STATUS In Progress 更新。
- **归档**：`openspec archive` 同步 6 条需求至 `openspec/specs/store-insights/spec.md`（5 scenarios），change dir 移入 `archive/2026-09-01-fu-11-store-insights`；PROJECT_STATUS FU-11 → Completed 顶部，In Progress 清空。

### 验证

- 三包 typecheck 干净 + 测试全绿（api 154 / web 50 / shared 56）+ `openspec validate --all` 通过。
- 真机 HTTP：admin 200（真实数据：趋势缺日补 0、低库存 stock≤1）、user 403、无 token 401。
- 浏览器 E2E（admin）：导航「运营看板」→ 看板页数据正确（08-19 等缺日补 0 显示、低库存行、分布列表、统计卡）；user 登录后无「运营看板」入口、直访 `/admin/insights` 跳首页。
- 踩坑修复验证：distribution 卡片标题重复已修复（专用 i18n key）；stale API server（`tsx src/index.ts` 无 watch 不热重载）导致 500 → `taskkill` 后重启 dev server 恢复。

### 踩坑（下次直接避）

1. **`tsx src/index.ts`（无 watch）不热重载**——改动服务端代码后必须手动重启 dev server，否则跑的是旧代码（本次 insights 500 根因）；`Get-CimInstance Win32_Process` 看命令行可确认启动方式。
2. **Prisma 5.17 groupBy 类型坑**——`_count` 结果 `_all` 是 `true | {...}` 联合，取值须 cast `(group._count as { _all: number })._all`；`orderBy: { _count: { _all } }` 非法，按具体非空列（如 `movieId`）排序等价。
3. **临时调试脚本别放 /tmp**——Windows 下相对导入会解析到临时目录；放 apps/api 内跑完即删。
4. **归档后 tasks.md 在 archive 目录**——5.5/5.6 验收/归档勾选要更新 archive 目录里的 tasks.md（原 change 目录已移动）。
5. **浏览器验证优先用 DOM snapshot**——本环境模型无法看图，截图存 artifact 仅作记录，验收以可访问性树/DOM 断言为准。
6. **`@fairy/shared` 改动后先 build**——新增 shared schema 后必须先 `pnpm --filter=@fairy/shared build` 再跑 api/web typecheck（延续 FU-10 坑 #1）。

### 下一步

- `storeInsightTool` chat 工具接入 agent（FU-11 第一期已交付，管理员可对话问店内数据）。
- 种子固定密码上线前改密（FU-5 挂账，仍待处理）。
- 旅行规划（`amapClient`/`planTripTool` 0 行）挂账。
- memory-center 技术债：续聊最近 10 条历史注入（`contextBuilder.ts` 内联查询）待记忆中心统一替换。

### Git Commits

| Hash | Message |
|------|---------|
| `3fc6840` | (see git log) |

### Status

[OK] **Completed**


### Git Commits

| Hash | Message |
|------|---------|
| `3fc6840` | (see git log) |

### Status

[OK] **Completed**


## Session 12: FU-12 store insight chat tool (storeInsightTool + admin-gated chat Q&A) delivery and archive

**Date**: 2026-09-01
**Task**: FU-12 store insight chat tool (storeInsightTool + admin-gated chat Q&A) delivery and archive
**Branch**: `master`

### Summary

Session summary was not supplied.

### Main Changes

### Summary

Delivered FU-12 storeInsightTool chat Q&A (Trellis track): admin can ask store metrics in chat (popular movies / trend / inventory / mood-scene / activity / overview), reusing FU-11 `insightService.getStoreInsightsOverview()` with topic slicing in the synthesizer; non-admin gets a friendly denial without the tool being called. Shared `insightTopicSchema` added.

### 改动

- **意图层**：`ChatIntent` 新增 `store_insight`（含 `topic`）；LLM 提示词加口语映射示例；规则兜底 `classifyStoreInsightByRules`（最火/热门→popular，库存/缺货→inventory，趋势/最近借阅→trend，心情/场景→mood_scene，活跃/注册→activity，店况/运营/数据→overview）；借/还分支内嵌 insight 判定（「最近借阅情况」不误判 borrow）。
- **规则优先（真机偏差）**：真机验收发现 deepseek 模型对严格 JSON 输出不可靠（偶发 177~200 token 自创 schema 长文本），「最近什么片最火」被误判 chitchat，规则兜底轮不到。改为 `classifyIntent` 先跑规则，命中 store_insight 即返回（不调 LLM）；其余意图仍 LLM 优先。已记入 ARCHITECTURE §8 决策行。
- **执行层**：`planner` 映射 `{ tool: "insight", topic }`；`dispatch` admin 门禁（非 admin 不调用工具，直接 `FORBIDDEN` observation，role 默认 "user" 保守）；`stateLoop`/`routes/chat` 透传 role。
- **合成层**：`responseSynthesizer` insight 分支按 topic 构造【事实】+ LLM 生成（兜底模板）；forbidden/失败降级文案；空态（无热门数据/无趋势）处理。
- **共享**：`insightTopicSchema`（zod enum popular|trend|inventory|mood_scene|activity|overview）+ 导出 + 测试。
- **文档**：`docs/tools.md` 工具注册表填充；ARCHITECTURE §5.8 数据流 + §8 决策 + §9 映射；PROJECT_STATUS In Progress→验收通过。
- 测试：api 180（22 文件：intentClassifier 22 / planner 4 / toolDispatcher 6 / responseSynthesizer 含 insight 7 / chat +2）、shared 58 全绿；api/shared/web typecheck 通过。

### 验证

- 真机验收 AC-1~AC-7 全过（双 dev server、admin token 提问）：
  - admin「最近什么片最火」→「最近最火的是《千与千寻》和《星际穿越》，都借出过两次」；
  - 「库存怎么样」→ 当前借出数与低库存《123》《海蒂》各剩 1；
  - 「最近借阅情况怎么样」→ 14 天合计借 7 还 6 + 最近三天明细；
  - 「最近大家看电影都喜欢什么心情」→ 治愈系第一；
  - 「最近活跃用户多吗」→ 4 注册/2 活跃/2 新增；
  - 「店况怎么样」→ 默认 overview 摘要；
  - user「库存怎么样」→「抱歉呀铃，店里的库存数据不方便透露呢」+ SSE done，diag 确认工具未调用（FORBIDDEN）。
- Trellis task `09-01-fu-12-store-insight-chat-tool` 已 `task.py archive`（含自动提交）。

### 踩坑（下次直接避）

1. **Git Bash curl 发中文 body 会按 GBK 编码**，服务器收到乱码 → 规则/LLM 全乱，表现为「chitchat 回复 + 莫名 123」。中文请求体必须 `printf > file` 后 `--data-binary @file`（UTF-8），或直接用 node/tsx 脚本发。排查时先怀疑编码，别先改代码。
2. **后台 dev server 会互相抢 3000 端口**：旧会话的后台任务（pnpm→tsx watch）被 kill 子进程后监督进程会自动 respawn，多个 watch 实例竞争端口 → 改文件后 reload 报 EADDRINUSE，且**看似在跑的 server 可能是旧代码**。清理要用 TaskStop 停任务本体（而非只 kill 子进程），确认监听者创建时间晚于代码改动。
3. **判断 server 是否载入新代码**：`tsx watch` 的 child 命令行里没有 `watch` 字样；要看父进程 cmdline 含 `tsx watch`。用 usage 日志（`agent.intent` 是否被调）可反推规则优先是否生效。
4. **模型严格 JSON 不可靠要留确定性后门**：LLM 意图分类对运营问数不可信时，让关键词规则先于 LLM 判定（AC-5 这类确定性验收必须走规则）。

### Status

[OK] **Completed**


### Git Commits

| Hash | Message |
|------|---------|
| `802e920` | (see git log) |

### Status

[OK] **Completed**


## Session 13: FU-13 travel planning (chat trip generation) delivery and archive

**Date**: 2026-09-01
**Task**: FU-13 travel planning phase 1 (chat trip generation) delivery and archive
**Branch**: `master`

### Summary

Delivered FU-13 travel planning phase 1: chat trip generation. `plan_trip` intent (rules before LLM) -> `planTripTool` (LLM itinerary draft + Amap POI/route validation + Trip persistence) -> SSE `trip` event -> `TripTimeline` card in chat. No-key environment degrades gracefully (validated:false).

### 改动

- **数据层**：`Trip` Prisma 模型（userId/destination/days/itinerary JSON/route JSON/status）+ `add_trip_model` 迁移（`@@index([userId, createdAt])`）+ `TRIP_PLANNED` 行为日志枚举。
- **共享层**：`tripSchemas`（tripPoiSchema/itineraryDaySchema/routeLegSchema/tripResultSchema/tripEventSchema）+ 导出 + 测试（shared 68）。
- **服务层**：`amapClient` 服务端高德 Web 服务封装（`/place/text` POI 搜索 + `/direction/driving` 驾车路线）；`AMAP_SERVER_KEY` 缺失/超时/业务失败一律 `null`（降级信号），不抛错。
- **工具层**：`planTripTool`（LLM 草稿 `{destination, itinerary}` JSON -> Amap 校验 POI/路线 -> 事务落库 Trip + 行为日志）；`hasDestinationByRules` 目的地规则兜底：草稿为空且消息无目的地线索 -> `unresolved`（反问目的地），有线索 -> `TRIP_DRAFT_FAILED`。
- **agent 链**：`classifyIntent` 新增 `plan_trip` 意图（TRAVEL_KEYWORD_RULES 规则先于 LLM）；`planner` -> `{tool:"trip"}`；`dispatch` trip 分支（`"unresolved" in result.data` 联合收窄修复 TS2322）；`responseSynthesizer` trip 分支（unresolved 反问 / facts + `{texts, trip}`）；`chat.ts` SSE `trip` 事件（会话落库 payload 含 trip，回放走同一渲染路径）。
- **前端**：`TripTimeline` 时间轴卡片（Day 分组 + POI 步骤 + 路线摘要 + validated 标识）+ ChatPage 接线 + i18n + 测试（web 55）。
- **文档**：API_CONTRACT §3.7 SSE 事件表加 `trip`；ARCHITECTURE §8 决策行（plan_trip 规则先于 LLM；Amap 校验可选降级）；docs/tools.md planTripTool 注册；openspec specs/agent-chat + travel-planning 同步。
- 测试：api 209 / web 55 / shared 68 全绿 + 三包 typecheck + `openspec validate --all` 10/10。

### 验证

- 真机验收 AC-1~AC-8 全过（双 dev server）：
  - 「帮我规划周末去杭州玩」-> `plan_trip` 识别 + SSE `trip` 事件（tripId/destination=杭州/days=2/itinerary/route/validated）+ TripTimeline 卡片；
  - DB 落库：`Trip` 行 + `TRIP_PLANNED` 日志（payload {destination:杭州, days:2, tripId, validated:false}）；
  - 「帮我规划个行程」（无目的地）-> 反问「想去哪儿玩呀？」（AC-5 修复：LLM 空草稿 + 无目的地线索 -> unresolved 而非报错）；
  - 无 `AMAP_SERVER_KEY`（空值）-> 行程照常返回 + POI `validated:false`，不崩不漏栈（AC-6 降级路径）；
  - chitchat 不建 Trip；SSE done 正常；admin（无画像）路径可用。
- 已知非阻塞：LLM 生成文本偶尔与事件数据措辞不一致（LLM 随机性），事件数据始终准确。

### 踩坑（下次直接避）

1. **curl 中文乱码再次确认**：Git Bash curl 内联中文 body 按 GBK 编码 -> 服务器收到 mojibake，规则/LLM 全乱。一律 `--data-binary @req.json`（UTF-8 文件）。
2. **tsx watch 陈旧状态**：改完源码后 curl 仍回旧行为（chitchat 而非 trip）——是 watch 实例竞争 3000 端口、跑的可能是旧代码；TaskStop 停任务本体 + 确认监听进程启动时间晚于改动。
3. **TS 联合收窄**：`TripResult` 无 `unresolved` 属性，`result.data.unresolved` 直接 TS2322；要用 `"unresolved" in result.data` 判别联合成员。
4. **Edit 工具片段替换易留残余**：给测试文件追加用例时 old_string 没带结尾 `});`，留下游离 `});`；补完先跑 typecheck/test 兜底。

### Git Commits

| Hash | Message |
|------|---------|
| (see git log) | feat: fu-13 travel planning chat trip generation |
| (see git log) | chore: archive fu-13 travel planning and record journal |
| (see git log) | docs: move fu-13 travel planning to completed |

### Status

[OK] **Completed**

### 补充（Session 13 行为修正）

- **身份分流**：用户明确两个身份定义不同——「铃」（画像名 `铃`，seed `user@fairy.local`）享受全能管家服务，行程规划直接执行并呈现；其余身份（绳匠 admin、其他用户）仅影片服务，行程规划婉拒（"不是我的专长"）并引导推荐影片。实现：`dispatch` trip 分支按画像名门禁（非「铃」不调用 `planTripTool`，返回 `TRIP_FORBIDDEN`），`stateLoop` 画像查询提前一次供 dispatch/synthesize 共用；`responseSynthesizer` trip 分支处理 `TRIP_FORBIDDEN`（模板 + facts，无 `trip` 事件）。真机复验：admin 问北京行程 → 婉拒转影片 + 无 trip 事件；铃 → 完整行程 + trip 事件。
- **回复人设**：`REPLY_SYSTEM_PROMPT` 由"录像带门店的 AI 助理"改为"绳匠的全能管家"——行程规划好直接呈现，绝不说"不是我的专长"，绝不转而推荐影片（修复模型把行程规划当职责外而推诿的问题）。测试：toolDispatcher +4、responseSynthesizer +1，api 211 全绿。
- **行程草稿高失败率修复**：用户反馈铃的账号也"无法规划"。实测 5 次请求 2 次失败（40%）——根因是 `draftTrip` 严格 JSON 输出不稳定：`temperature 0.7` 偏高、失败不重试、`maxTokens 800` 易截断非法 JSON。修复：温度降到 `0.2`、失败重试一次、`maxTokens` 提到 `1200`、`itinerary[].title` 放宽为可空（映射时 `?? ""`）。修复后实测 6/6 成功。教训：**LLM 结构化输出必须低温度 + 重试 + 足够 token 预算**（同 FU-12 "模型严格 JSON 不可靠"的延伸）。
- **行程规划开放范围修正**：用户要求 admin（绳匠）账号也能规划行程（Fairy 是绳匠的管家，主人应可用）。门禁从"仅画像名「铃」"放宽为「铃 或 admin」（`profile?.name !== "铃" && role !== "admin"` 才 FORBIDDEN）；普通用户仍婉拒。草稿重试从 1 次提到 2 次（共 3 次尝试），admin 实测 4/4 成功、铃 6/6 成功。测试 api 213 全绿（toolDispatcher +1：admin 可规划）。

## Session 14: FU-14 memory-center (phase 1: structured memory persistence + retrieval injection) delivery and archive

**Date**: 2026-09-06
**Task**: FU-14 memory-center phase 1 delivery and archive
**Branch**: `master`

### Summary

Delivered FU-14 memory-center phase 1: per-turn LLM memory extraction persisted to a new `Memory` table, retrieved ≤5 rows per user profile and injected into the reply prompt as a 【记忆】 block (replacing the `TODO(memory-center)` history-only bypass). Silent degradation everywhere: LLM failure / no key / parse failure → skip extraction; memory fetch failure → empty block.

### 改动

- **数据层**：`MemoryKind` 枚举（PREFERENCE/FACT/INTENT）+ `Memory` 模型（profileId → Profile.userId 级联删除、sessionId?、kind、content、metadata Json?、createdAt、`@@index([profileId, kind])`、`@@index([profileId, createdAt])`、`@@map("memories")`）+ `add_memory_model` 迁移 + generate。
- **共享层**：`memorySchemas`（memoryKindSchema/memoryRecordSchema/memoryExtractionSchema + 类型）+ 导出 + 测试（shared 76）。
- **服务层**：`memory/memoryService`（`addMemory` 落库 + `searchMemories`：profileId 必填隔离 + kind/content 关键词/倒序限量默认 5）；`memory/memoryExtractor`（`agent.memory` source：LLM 结构化 JSON `{memories:[{kind,content}]}`，sanitize + 低温度 0.2，失败/非法 JSON/无 key 一律返回空数组静默）。
- **agent 链**：`contextBuilder.buildMemoryBlock`（≤5 条注入【记忆】区块，无记忆干净省略）；`stateLoop` profile 查询后 `searchMemories(profile.userId)`（catch → []）接线三路 synthesize；`responseSynthesizer` SynthesisContext.memories + prompt 拼装；`chat.ts` SSE `done` 后 `void extractAndStoreMemories(...).catch(...)` 旁路抽取（失败仅记日志）。
- **文档**：ARCHITECTURE §5.4 记忆流重写 + §8 决策行 + §9 模块图；API_CONTRACT 内部说明（无公共契约变更）；PROJECT_STATUS / requirements README / 需求文档状态。
- 测试：api 232（memoryService 5 / memoryExtractor 7 / contextBuilder + / responseSynthesizer + / chat +3）/ shared 76 / web 55 全绿 + 三包 typecheck + `openspec validate --all` 11/11。

### 验证

- 真机验收 AC-1~AC-7 全过（双 dev server）：
  - AC-1：铃发「我平时最喜欢看科幻片，尤其是太空题材的」→ 真实 LLM 抽取 → 新 `Memory` 行落库（kind=PREFERENCE、关联 session）；
  - AC-3：全新会话（无 sessionId）问「我喜欢什么类型的片子？」→ 回复「铃，我记得你最爱科幻片，特别是太空题材的，对吧？」——跨会话复用；
  - AC-2/AC-4/AC-5/AC-6：deepseek 余额耗尽期间 LLM 全链路降级——回复走模板、抽取静默跳过、SSE 流完整不崩不漏栈；DB 落库/检索（addMemory/searchMemories）独立于 LLM 可用；
  - AC-7：跨用户隔离（铃 vs admin 各查各的 profileId）。
- 阻塞与恢复：AC-1（LLM 抽取）/AC-3 曾因 deepseek 账户余额耗尽（Insufficient Balance）阻塞 → 用户充值后补验通过。

### 踩坑（下次直接避）

1. **deepseek 余额耗尽 = LLM 全链路静默降级**：`Insufficient Balance` 时所有 `tryChat` 解析失败，日志满屏 `{source:"llmClient", code:"PARSE"}`；回复变模板、抽取被跳过——功能仍不崩（降级设计有效），但**LLM 依赖验收无法进行**。验收前先探测余额。
2. **改 shared schema 后必须 build**：api 消费 `@fairy/shared` 编译产物 `dist/`，新增 schema 不 build 则运行时 `undefined`（测试报 "Cannot read properties of undefined"），先 `pnpm --filter=@fairy/shared build`。
3. **Git Bash /tmp 与 Windows 工具路径不通**：bash 的 `/tmp` 是 MSYS 路径，Windows 原生 python 打开 `/tmp/x.json` 报 FileNotFoundError——给 python 传 `$(cygpath -w /tmp/x.json)`。
4. **Prisma 模型类型是顶层导出**：`@prisma/client` 的模型类型（如 `Memory`）不是 `Prisma.Memory` namespace 成员，fixture 类型用顶层 `Memory`/`Partial<Memory>`。
5. **dev server 会锁 prisma query engine dll**：Windows 上 `prisma generate` EPERM 前先停 3000/5173 进程（本次需在重启用前 regenerate 的次序要留意）。
6. **Neon 冷启动 P1001 偶发**：首次请求可能「Can't reach database server」，等 5-8s 重试即好（连接串已带 connect_timeout/pool_timeout）。

### Git Commits

| Hash | Message |
|------|---------|
| (see git log) | feat: fu-14 memory center structured memory persistence and injection |
| (see git log) | chore: archive fu-14 memory center and record journal |
| (see git log) | docs: move fu-14 memory center to completed |

### Status

[OK] **Completed**

## Session 15: FU-15 memory-center phase 2 (admin memory management REST + /admin/memories page) delivery and archive

**Date**: 2026-09-06
**Task**: FU-15 memory-center phase 2 delivery and archive
**Branch**: `master`

### Summary

Delivered FU-15 memory-center phase 2 — the admin management surface for the FU-14 `Memory` store: admin-only REST endpoints (`GET/POST /api/memories`, `PATCH/DELETE /api/memories/:id`) plus an admin web page `/admin/memories` (list + filter + pagination + create/edit/delete). Admin-written rows land through the same `memoryService` as LLM-extracted rows, so they are injected into the next conversation turn. No DB migration needed (existing indexes suffice). pgvector/embedding deferred to a separate phase; user-facing self-inspection and profile write-back out of scope.

### 改动

- **共享层**：`memorySchemas` 二期扩展——`memoryQuerySchema`（page/limit/userId/kind/keyword）、`memoryListItemSchema`（id/userId/email/kind/content/sessionId/createdAt）、`memoryCreateSchema`（userId/kind/content/sessionId?）、`memoryUpdateSchema`（kind?/content? 至少一项）+ 类型导出 + 测试（shared 87）。
- **服务层**：`memory/memoryService` 增加 `listMemories`（join Profile→User 带 email、userId/kind/keyword 过滤、createdAt 倒序分页 + total）、`createMemory`（Profile 不存在 → `PROFILE_NOT_FOUND`，复用 `addMemory` 落库链路）、`updateMemory`（kind/content）、`deleteMemory`（硬删，`MEMORY_NOT_FOUND`）；`controllers/memoryController` 薄 handlers；`routes/memories.ts` 四端点全部 `requireRole("admin")`；`app.ts` 挂载 `/api/memories`。
- **Web**：`lib/memoryApi`（list/create/update/delete，复用 `lib/http` 统一客户端）；`components/admin/MemoryAdminPage`（/admin/memories：列表 + kind/keyword 筛选 + 分页 + 新增弹窗（选用户，fetchProfiles）+ 编辑弹窗（kind/content）+ 删除确认 + 加载/错误/空态 + 全中文 i18n）；导航「记忆管理」+ 路由 `RequireAuth role="admin"`（非 admin 跳首页）。
- **文档**：API_CONTRACT §3.14 `/api/memories` 契约（GET 列表/POST/PATCH/DELETE + 错误码表 `MEMORY_NOT_FOUND`、刷新 §3.7 FU-14 内部说明）；ARCHITECTURE §5.4 增管理面数据流 + §8 三条决策行 + §9 模块图；PROJECT_STATUS / requirements README。
- 测试：api 255 / shared 87 / web 66（MemoryAdminPage 9 + App 更新）+ 三包 typecheck + `openspec validate --all` 12/12。

### 验证

- 真机验收 AC-1~AC-7 全过（双 dev server）：
  - AC-1：admin `GET /api/memories` 分页列表，条目含 email（Profile→User join）、支持 userId/kind/keyword 过滤、total 与过滤一致、createdAt 倒序；
  - AC-2：无 token 401、user 403 `FORBIDDEN`、admin 200；
  - AC-3：POST 201 返回落库记录且 GET 可查到、未知 profileId 404、非法 kind/空 content 400；
  - AC-4：PATCH kind/content 200 持久化、空 body 400、未知 id 404；
  - AC-5：DELETE 200 `{code:"OK", data:{id}}`、重复删 404、行从列表消失；
  - AC-6：浏览器 E2E——admin 导航「记忆管理」→ 真实行列表 → 新增（选用户）持久化 → 编辑持久化 → 确认删除 → kind 筛选空态 → 关键词收窄；user 访问被拦跳首页；
  - AC-7：admin 在管理页补录「灯塔/太空」记忆 → **全新会话**真实 LLM 回复引用（"要不要试试把太空的辽阔和灯塔的孤寂揉在一起？"）；管理 REST 全程不依赖 LLM。
- 验收后清理测试行，DB 仅留 2 条 FU-14 种子记忆；浏览器还原为 user@fairy.local 登录态。

### 踩坑（下次直接避）

1. **API dev server 不是 watch**（`npx tsx src/index.ts`）：新增路由文件后必须重启进程，否则 GET /api/memories 404（进程 predates 路由挂载）。
2. **验收脚本读错 total 位置**：AC-1 断言读 `data.total`，实际列表信封是 `data.pagination.total`——脚本假失败，接口本身正确；先核对契约再改脚本。
3. **jest-dom matcher 类型未启用**：`toHaveValue` 在仓库测试类型下不存在，用 `(el as HTMLSelectElement).value` 断言。
4. **findByText 多元素冲突**：fixture 默认同 email/kind 标签会匹配多行或筛选项——给第二条 fixture 覆盖 email、或改用 `findAllByText(...).length >= 1`（沿 BehaviorPage 风格）。
5. **playwright 定位瞬态重复**：`getByRole("textbox", {name:"内容"})` count 偶发 >1（渲染中），改走 `page.evaluate` 确认真实 DOM 只有一个 textarea，再用元素 scope 操作。

### Git Commits

| Hash | Message |
|------|---------|
| (see git log) | feat: fu-15 memory management admin rest and page |
| (see git log) | chore: archive fu-15 memory center management and record journal |
| (see git log) | docs: move fu-15 memory center management to completed |

### Status

[OK] **Completed**

## Session 16: FU-16 pgvector vector retrieval (memory center phase 3: hybrid retrieval) delivery and archive

**Date**: 2026-09-06
**Task**: FU-16 pgvector 记忆向量检索交付与归档
**Branch**: `master`（工作区未提交）

### Summary

Delivered FU-16 — 记忆中心三期：pgvector 向量检索。`Memory` 增加 `embedding vector(1536)` 列 + HNSW 索引（raw SQL 读写，不暴露给 Prisma client）；ai-sdk 新增**与 chat provider 解耦的可选 embed 客户端**（`EMBEDDING_API_KEY`，缺省回退 `OPENAI_API_KEY`；`EMBEDDING_MODEL` 默认 `text-embedding-3-small`；无 key → provider 为 null 优雅降级）；`addMemory`/`createMemory` 落库时写向量（失败静默仅日志）；`searchMemories` 升级为**混合检索**（cosine 向量召回 + 结构化兜底/补足，profileId 隔离，≤5 注入预算）；幂等回填脚本；文档脊柱同步；270 api + 16 ai-sdk 测试全绿；默认无 key 真机回归验收通过；OpenSpec 提案归档。真实 embed key 的端到端验收待 owner 补跑（本环境无 OpenAI key）。

### 改动

- **数据库**：`schema.prisma` `Memory.embedding Unsupported("vector(1536)")`；迁移 `20260906142125_add_memory_embedding`（`CREATE EXTENSION IF NOT EXISTS "vector"` + 加列 + HNSW `memories_embedding_idx ... vector_cosine_ops`）。embedding 只经 `$queryRaw`/`$executeRaw`（`Prisma.sql` 参数化 `'[...]'::vector`），不进入 Prisma client 类型面。
- **ai-sdk**：`factory.createEmbeddingProvider()`——独立于 chat provider 的可选供应商构造，读 `EMBEDDING_API_KEY`/`EMBEDDING_MODEL`/`EMBEDDING_BASE_URL`，无 key → `null`；1536 维常量导出 + 维度守卫。ai-sdk 测试 +16（null provider / 成功向量 / 维度不符 / reject 降级）。
- **api**：`memory/embeddingClient.ts`（memoized 单例，`embedContent(text) → Promise<number[] | null>`，静默降级）；`memoryService` 写入路径两处（`addMemory`/`createMemory`）落库后 `refreshEmbeddingQuietly`（失败仅 warn）；`searchMemories(profileId, { query })` 混合逻辑——query 存在时 `embedContent`，命中向量则 `<=>` cosine 升序 top-N 召回（`kind`/`keyword` 可预过滤），不足 limit 用结构化按时间倒序补足并 `excludeIds` 排除已召回；空向量 / 无 key / embed 抛错一律回退结构化，行为与 FU-14 一致。`stateLoop` 传 `{ query: input.message }`。api 测试 270。
- **回填脚本**：`scripts/backfill-memory-embeddings.ts`（BATCH 20 轮询 `embedding IS NULL`，逐行 try/catch embed + UPDATE，无 key 打印提示 exit 0，幂等）；`packages/database` 增加 `backfill:embeddings` script。
- **文档**：ARCHITECTURE §5.4/§8/§9、API_CONTRACT 记忆中心 note + §3.14（embedding 属内部增强、永不下发、无新契约字段）、PROJECT_STATUS Completed 条目 + Risks（keyed 验收待跑）、`apps/api/.env.example` 占位项（`EMBEDDING_API_KEY`/`EMBEDDING_MODEL`/`EMBEDDING_BASE_URL`，仅占位值）。OpenSpec 归档合并后 `openspec validate --all` 12/12。
- **未提交**：全套改动仍在工作区（见 git status），待 owner 审阅后按 AGENTS §10 提交。

### 验证

- 单元：api 270 / ai-sdk 16 全绿；shared/database/ai-sdk/api/web 五包 typecheck 通过。
- Neon DB smoke：`memories_embedding_idx`（HNSW）存在；cosine `<=>` 查询对 live dev DB 执行返回 0 行、无报错。
- 真机无 key 回归 PASSED（api :3000 + web :5173 双进程）：mint real JWT → admin `GET /api/memories` 200（列出科幻种子记忆）；chat「我喜欢什么类型的片子」SSE 回复引用已存记忆，随后 done 事件——结构化召回路径，SSE 事件名与负载形状不变。
- 回填脚本无 key 路径 PASSED：打印「未配置 EMBEDDING_API_KEY…跳过回填。」exit 0。
- `openspec validate --all` 12/12；archive 完成（tasks.md 6.2 有意保留 open，留给 owner keyed 验收）。

### 踩坑（下次直接避）

1. **ai-sdk 改动后必须先 rebuild**：api 消费编译产物 `dist/`，新导出不 build 则 typecheck 报 TS2724/TS2305——先 `pnpm --filter=@fairy/ai-sdk build`。
2. **`Prisma.sql` 的测试 mock 必须递归扁平化嵌套 fragments**：嵌套 fragment 不展开会落到 `values` 而非 `strings`，WHERE 断言全错——mock 里用 appendFragment helper。
3. **`clearAllMocks` 保留 mock implementation**：`mockResolvedValue(VEC_1536)` 会跨测试泄漏，重置须显式 `vi.mocked(x).mockResolvedValue(default)`（放 beforeEach）。
4. **bare `node` 跑 tsx-only 包会 `ERR_UNSUPPORTED_DIR_IMPORT`**：`packages/*` 的 ESM 产物不支持 extension-less 目录导入，用 `npx tsx` 跑脚本/验收。
5. **Git Bash 下 `taskkill /PID` 被 MSYS 吃掉**：写成 `taskkill //PID <pid> //T //F`（双斜杠）。
6. **OpenSpec archive 对 header 与 scenario 全量匹配**：header 文本不一致 → “not found” abort；MODIFIED block 缺 root 已有 scenario → “scenario(s) not present” abort——归档前把 change spec 对齐 root（requirement body + 全 scenarios 一起带）。
7. **dev-stub 认证头不存在**：本地验收 admin REST 需用 `apps/api/.env` 的 real `JWT_SECRET` mint 真 JWT（脚本用完即删，token 不打印）。

### Git Commits

| Hash | Message |
|------|---------|
| `105b45b` | feat: fu-16 pgvector memory embeddings and hybrid retrieval |
| `047f9a3` | chore: archive fu-16 pgvector vector retrieval and record journal |
| `d723b4a` | docs: move fu-16 pgvector vector retrieval to completed |

### Status

[OK] **Completed**（6.2 配 key 端到端验收除外——见 Next Steps，由 owner 执行）

### Next Steps

- Owner：配置真实 `EMBEDDING_API_KEY` → 跑 keyed 端到端（真实 embed 落库 / 语义召回命中 / 回填脚本幂等重跑）→ 通过后勾选 tasks.md 6.2。
- Owner 要求后按序提交：`feat: fu-16 pgvector memory embeddings and hybrid retrieval` / `chore: archive fu-16 pgvector vector retrieval and record journal` / `docs: move fu-16 ... to completed`。

## Session 17: FU-17 memory self-inspection entry (in-chat read-only panel + GET /api/memories/me) delivery and archive

**Date**: 2026-09-07
**Task**: FU-17 记忆自查入口交付与归档（记忆中心四期）
**Branch**: `master`（工作区未提交）

### Summary

Delivered FU-17 — 记忆自查入口：登录用户在会话页经「Fairy 记住了什么」只读面板查看**本人**记忆。利用 `Profile.userId` 主键 == `Memory.profileId` 恒等式零迁移落地 `GET /api/memories/me`（任意已登录角色，admin 管理面不变）；shared Zod 未知键剥除实现越权参数（`userId`/`email`）静默忽略；web `MemorySelfPanel` + ChatPage 头部开关 + i18n；文档脊柱同步；shared 93 / api 277 / web 71 测试全绿；真机验收 AC-1~AC-5 全过（自查不依赖 LLM/embed，无 keyed 残留）；OpenSpec 提案归档。

### 改动

- **shared**：`memorySchemas` 新增 `memorySelfQuerySchema`（page/limit/kind/keyword；zod 默认剥除未知键——越权 `userId`/`email` 视同不存在）、`memorySelfListItemSchema`（含 `sessionId` 可空，**无 email/userId**）、`memorySelfListFeedSchema` + 类型导出 + 测试（shared 套件 93）。
- **api**：`memoryService.listOwnMemories(profileId, query)`（profileId 限定 + kind/keyword 过滤 + createdAt 倒序 + 分页，不 join email）；`routes/memories.ts` `GET /me`（置于 `/` 之前；router-level authMiddleware 已认证，仅无 token 401、非法 kind 400，**无 403 分支**）；`memoryController.listMyMemoriesHandler`（读 `res.locals.userId`）。routes + service 测试各补 describe（api 套件 277）。
- **web**：`lib/memoryApi.listMyMemories`（构造 `/api/memories/me` 查询，不带 userId/email）；`components/chat/MemorySelfPanel`（只读：kind 标签 + 来源标注——`sessionId` 非空「对话抽取」/ 空「系统录入」+ 时间倒序 + 分页 footer + 加载/错误/空态，PAGE_SIZE 20）；`ChatPage` 标题区「Fairy 记住了什么」切换按钮（`aria-expanded`）；i18n `memory.self.*`。web 测试：MemorySelfPanel.test.tsx 4（co-located）+ ChatPage 补 1（开关开合 + 空态调用断言）。
- **文档**：ARCHITECTURE §5.4 自查数据流/§8 决策行/§9 模块映射；API_CONTRACT §3.14 重构为自查 §3.14.1 + admin 列表/创建/更新/删除顺延 §3.14.2–3.14.5；requirements README FU-17 行 proposed → approved；需求文档状态 approved + 归档链接；PROJECT_STATUS Completed + Last Updated。
- **未提交**：全套改动仍在工作区（见 git status），待 owner 审阅后按 AGENTS §10 提交。

### 验证

- 单元：shared 93 / api 277 / web 71（MemorySelfPanel 4 + ChatPage toggle 1）全绿；shared/api/web 三包 typecheck 通过。
- `openspec validate --all` 归档前 13/13 → archive（spec memory-management +1 added）→ 12/12。
- 真机验收 PASSED（api :3000 + web :5173 双进程，mint real JWT via login）：user `/me` 返回本人 2 条记忆（1 条对话抽取 sessionId 非空 + 1 条系统录入 sessionId null），条目**无 email/userId**、createdAt 倒序；`page/limit/kind/keyword` 过滤生效；**越权 `userId`/`email` 参数被剥除、结果不变**；admin `/me` 只回自身（admin 无记忆 → 空列表）而 admin `GET /api/memories` 仍列出全部用户（隔离成立）；匿名 401 `UNAUTHORIZED`；非法 kind 400 `VALIDATION_ERROR`。

### 踩坑（下次直接避）

1. **api/web 消费 shared 编译产物 `dist/`**：新增 `memorySelfQuerySchema` 后必须先 `pnpm --filter=@fairy/shared build`，否则路由测试 `safeParse` undefined → 500（FU-16 同款坑）。
2. **zod object 默认剥除未知键**：对越权参数是“静默忽略”而非报错——self 条目/查询 schema 测试用 `not.toHaveProperty("userId"/"email")` 断言，不要写 rejects。
3. **Windows Git Bash 的 curl 会按 ANSI 编码命令行中文**：POST content 落库变乱码、中文 keyword 过滤 0 命中——用 percent-encoded UTF-8（如 `keyword=%E7%A7%91%E5%B9%BB`）验证；服务端管线经 ASCII keyword 命中 + 直连 Prisma `contains('科幻')` 命中 证明无 bug（属客户端编码）。
4. **组件测试漏 import `afterEach`** → web typecheck TS2304；补导入即可。

### Git Commits

| Hash | Message |
|------|---------|
| `0a4f823` | feat: fu-17 memory self inspection api and in-chat panel |
| `aece246` | chore: archive fu-17 memory self inspection and record journal |
| `718645a` | docs: move fu-17 memory self inspection to completed |

### Status

[OK] **Completed**（自查面不依赖 LLM/embed key，无 owner 补跑项）

### Next Steps

- ~~Owner 审阅后按需提交~~（已完成：`0a4f823` / `aece246` / `718645a`，未推送）。


## Session 18: FU-18 profile writeback (preference memory → Profile.likeGenres auto merge) delivery and archive

**Date**: 2026-09-07
**Task**: FU-18 画像反向回写交付与归档（记忆中心五期）
**Branch**: `master`（工作区未提交）

### Summary

Delivered FU-18 — 画像反向回写：每轮对话抽取（FU-14 旁路）在 `memories` 外同产顶层 `genres`（片型候选 ≤3），本轮 ≥1 条 preference 记忆**成功落库**且候选非空时，旁路把候选经影片库词表白名单过滤后**增量并集**并入 `Profile.likeGenres`。无新端点、无 DB 迁移；白名单/合并/事务全部收敛在 `profileService`（TTL 5min 缓存 + 只增不减 + 幂等无变化不写 + 全程静默降级）。shared 96 / api 292 测试全绿；真机 AC-1~AC-6 全过（真实 deepseek 对话 + admin PATCH 并存验证）；OpenSpec 提案归档。

### 改动

- **shared**：`memoryExtractionSchema` 增加可选顶层 `genres`（`z.array(z.string().trim().min(1)).max(3).optional()`，缺省向后兼容）+ 类型导出 + 测试（含超 3 拒绝/空白剔除；shared 套件 96）。
- **api memory 链路**：`memoryExtractor` 提示词 JSON 格式扩展 `"genres":["片型"]`（语义约束仅「用户明确表达影片偏好时 ≤3」，**不注入 DB 词表**）；内部 `extractTurn` 返回完整 `MemoryExtraction`（失败降级 `{memories:[]}`），`extractMemories` 仅取 `.memories`（对外不变）；`extractAndStoreMemories` 落库后按门禁旁路 `profileService.mergeLikeGenres(profileId, genres)`（`.catch(() => undefined)`）。测试补 5 例（有 preference+候选触发 / 无 preference 不触发 / 无候选不触发 / preference 落库失败不触发 / 回写抛错不影响落库）。
- **api profile 侧**：`profileService.loadGenreWhitelist`（`Movie.genres` distinct + 空串/纯数字脏值剔除（库内 "1233" 类）+ 进程内 TTL 5min 缓存；查询失败返回空名单不抛出、不缓存失败；测试用 `resetGenreWhitelistForTests` 清缓存，沿用 `resetLlmProviderForTests` 约定）+ `mergeLikeGenres(profileId, candidates)`（白名单过滤 → `$transaction` 内读 profile（缺失静默跳过）→ `Set` 并集 → 无变化不写、有变化 `update likeGenres`；只增不减）。新测试文件 `profileService.test.ts` 10 例。
- **文档**：ARCHITECTURE §5.4 回写支路/§8 决策行/§9 模块映射；API_CONTRACT 记忆中心内部行为说明补 FU-18 一句（**无公共契约变更**）；requirements README + 需求文档状态归档链接；PROJECT_STATUS Completed + 决策行 + Last Updated。
- **提交**：owner 批准「提交三连，不推送」后已按序提交 `925c457`（feat）/ `a546693`（chore）/ `96348db`（docs），另加 `2c6f00a`（本 journal 哈希回填），均未推送；本行下方 Git Commits 表已回填真实哈希。

### 验证

- 单元：shared 96 / api 292 全绿；shared/api typecheck 通过。
- `openspec validate --all` 归档前 13/13 → archive（spec memory-center +1 added）→ 12/12。
- 真机验收 PASSED（api :3000 + web :5173 双进程，真实 deepseek 对话 + login minted JWT）：AC-1「迷上动作片」→ preference 记忆落库且 `likeGenres` 并入 `动作`；同句重放不重复（幂等）。AC-2「不吃辣」（无片型）与「喜欢歌舞片」（候选 `歌舞` 未命中白名单）→ 记忆照常落库、`likeGenres` 不变。AC-3/AC-5 admin PATCH 加 `喜剧`（非白名单标签）后合并 `爱情` → `科幻/悬疑/喜剧/动作/爱情` 全保留、PATCH 响应仍 `{code:"OK",data,msg}`、无新端点。AC-4 静默降级（LLM 故障/解析失败/白名单失败/回写抛错）由单测覆盖；真机 mojibake 输入轮亦实测（LLM 看不懂 → 零落库零回写、对话正常）。AC-6 新影片带 `犯罪` 类型 → TTL 内不命中（缓存延迟规则生效）→ 重启 API 清缓存后同句并入 `犯罪`。验收后已清理 7 条记忆 / 8 个会话 / 1 部临时影片，`likeGenres` 还原基线 `["科幻","悬疑"]`。

### 踩坑（下次直接避）

1. **node/curl 的 `/tmp` 不一致**：Windows Git Bash curl 写 `/tmp/*.txt` 正常，但 `node -e fs.readFileSync('/tmp/...')` 按 Windows 解析成 `E:\tmp` → ENOENT。跨工具传文件时落在 workspace 内再用，用完即删；或先用 bash grep 提取中间结果再喂 node。
2. **Git Bash curl 命令行中文仍是 ANSI 乱码（FU-17 同款坑）**：payload 一律 `node -e fs.writeFileSync('x.json', JSON.stringify({...}))` 生成 UTF-8 文件 + `curl --data @x.json`，杜绝 mojibake。
3. **测试 mock 的默认返回必须是 Promise**：`vi.mock` factory 里 `mergeLikeGenres: vi.fn()` 默认返回 `undefined`，生产代码 `.catch()` 直接炸 `Cannot read properties of undefined` —— factory 后补一行 `vi.mocked(...).mockResolvedValue(undefined)` 作默认实现。
4. **`vi.mocked(...).mockResolvedValue` 走真实 Prisma 类型**：partial row（如 `{likeGenres:[...]}`）直接传给 profile/movie mock 会 TS2345；按 memoryService.test 惯例 `as unknown as ProfileRow / Movie[]` 断言即可。
5. **模块级缓存跨用例泄漏**：白名单 TTL 缓存若留在模块作用域，同一测试文件内后续用例会命中前一个用例的旧缓存——加 `resetGenreWhitelistForTests()` 在 `beforeEach` 清，别指望 fake timers 处理跨用例隔离。

### Git Commits

| Hash | Message |
|------|---------|
| `925c457` | feat: fu-18 writeback preference memory genres into profile likeGenres |
| `a546693` | chore: archive fu-18 profile writeback and record journal |
| `96348db` | docs: move fu-18 profile writeback to completed |

### Status

[OK] **Completed**（真机 AC-1~AC-6 全过；无需 owner 补跑项；AC-6 缓存延迟规则已用重启清缓存演示并登记 ARCHITECTURE）

### Next Steps

- ~~Owner 审阅后按需提交（FU-16/17 三连样式）~~（已完成：`925c457` / `a546693` / `96348db` / `2c6f00a`，未推送）。
- **推送延后（2026-09-07）**：尝试推送时 github.com 443 不可达（timeout + connection reset），owner 决定留待网络恢复后补推；届时在仓库根执行 `git push origin master`（当前本地领先 origin 4 个提交，origin 停 `718645a`）。

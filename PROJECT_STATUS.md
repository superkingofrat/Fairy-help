# Fairy — 项目状态

---

## Project Phase（项目阶段）

**Development（开发中）**

> Monorepo 脚手架、影片库 CRUD MVP、Phase 2 Agent 推荐与借阅、FU-1 画像写接口与管理 CRUD、FU-2 真实 LLM 意图与回复、FU-3 行为流水查询与管理页、FU-4 归还（聊天文本）、FU-5 真实 JWT 认证、FU-6 REST 借阅、FU-8 一键归还 UI 已交付。后续为 FU-7。

---

## Completed Modules（已完成模块）

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

（无）

---

## Next Steps（下一步）

- FU-9 影片库浏览页（直接借阅）— **需求已批准**：[2026-09-01-fu-9-movie-library-page.md](docs/requirements/2026-09-01-fu-9-movie-library-page.md)（2026-09-01 grill-me 收敛四项决策：独立 /movies 页 / REST 借阅 / 分页+筛选+搜索 / 已借标记归还留 chat）；待 `/opsx:propose`
- FU-7 Session 表与对话历史回放
- （FU 外挂账）登录限速；注册/建号流程；refresh token

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

---

## Last Updated（最近更新）

**2026-09-01**

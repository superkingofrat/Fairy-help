# Fairy — 项目状态

---

## Project Phase（项目阶段）

**Development（开发中）**

> Monorepo 脚手架、影片库 CRUD MVP、Phase 2 Agent 推荐与借阅、FU-1 画像写接口与管理 CRUD、FU-2 真实 LLM 意图与回复、FU-3 行为流水查询与管理页已交付。后续为 FU-4～FU-7。

---

## Completed Modules（已完成模块）

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

- FU-4 归还（回补库存 + 还片意图）
- FU-5 真实 JWT 替换 dev auth stub（当前前端 admin 页仍写死 `X-Dev-Role: admin`，上生产前必须完成）
- FU-6 REST `POST /api/borrow`
- FU-7 Session 表与对话历史回放

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

**2026-08-29**

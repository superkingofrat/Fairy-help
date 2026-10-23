# Fairy

带**工具调用**与**长期记忆**的 AI Agent 全栈项目。Agent 完整走「规划 → 调用工具 → 执行 → 生成回复」闭环，真实操作库存、租约、画像与记忆——不是包一层的对话壳。业务载体是录像带租赁门店管理系统。

几个值得看的工程点：

- **记忆检索**：pgvector 混合检索（cosine top-N + kind/keyword 预过滤 + 时间倒序补齐），写入实时 embed、存量幂等回填；无 key 时静默降级为结构化路径
- **prompt 预算按实测调优**：默认供应商是 reasoning 模型，思考与正文共用同一个 completion 预算。实测 4000 token 时行程草稿失败率约 2/3（思考独自吃掉约 3800、正文被截断），按「预算 + 输出规格」配对修到 6000 并加回归测试锁住
- **防幻觉做在契约层**：定位到系统自身的 prompt 在诱导模型幻觉（无条件断言「偏好已体现在行程中」进【事实】块），根因是数据契约没有承载位；重构为 step 级可空 `preferenceBasis` + 证据驱动的条件式归属
- **并发正确性用真实库验证**：借阅 `SELECT ... FOR UPDATE` 串行化，归还改事务内 compare-and-swap；20 路并发借阅断言不超卖，以 `TEST_DATABASE_URL` 门控（未配置即跳过，绝不指向开发库）
- **全链路静默降级**：无 AI key / 无 embedding key / 无高德 key 均不崩不漏栈，用户看到的是自然语言而非错误码

- 前端：React + TypeScript + Tailwind CSS + Zustand + Vite
- 后端：Node.js + Express（SSE 流式对话）
- 数据库：PostgreSQL + Prisma（开发库为 Neon，含 pgvector 向量检索）
- AI：`@fairy/ai-sdk` 统一封装 DeepSeek（默认）/ OpenAI / Claude，聊天与 embedding 解耦
- 测试：Vitest（757 个用例，全 mock，CI 无需密钥与数据库）；真实库并发测试以 `TEST_DATABASE_URL` 门控
- 工程：pnpm workspace + Turborepo，GitHub Actions（lint → typecheck → test）

## 仓库结构

本仓库根目录是**治理与文档层**，产品代码在 `Fairy/` 子目录（pnpm monorepo，所有命令在此执行）：

```
Fairy-help/
├── AGENTS.md                   # AI 智能体工作宪法（不可协商规则）
├── ARCHITECTURE.md              # 架构、模块边界与数据流（单一事实来源）
├── API_CONTRACT.md              # 全部 HTTP API 契约（{ code, data, msg } 信封）
├── PROJECT_STATUS.md            # 项目阶段、已完成模块、进行中、风险与决策
├── docs/
│   ├── requirements/            # 需求文档与索引（grill-me 收敛产物）
│   └── openspec/                # OpenSpec 提案、specs 与归档
├── Fairy/                       # ← 产品代码 monorepo（在此执行 pnpm 命令）
│   ├── apps/web/                # React 前端（:5173）
│   ├── apps/api/                # Express 后端（:3000）
│   ├── packages/shared/         # Zod schema 与共享类型
│   ├── packages/ai-sdk/         # 统一 AI 供应商封装
│   ├── packages/database/       # Prisma schema、迁移、seed
│   ├── docs/                    # 部署清单、提示词快照、工具注册表
│   ├── scripts/                 # 本地开发脚本、embedding 回填脚本
│   └── README.md                # 快速开始（安装/迁移/启动/测试）
└── .trellis/                    # Trellis 任务与工作日志
```

## 快速开始

前置：Node.js 20+、Corepack（pnpm 版本以 `Fairy/package.json` 的 `packageManager` 为准）、可用的 PostgreSQL（Neon 或本地）。

```bash
cd Fairy   # 仓库根没有 workspace，直接跑 pnpm 会报 ERR_PNPM_NO_PKG_MANIFEST

pnpm install

# 配置环境变量（密钥只留本地，永不提交）
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env
# 注意：apps/api/.env 与 packages/database/.env 的 DATABASE_URL 必须一致

pnpm --filter=@fairy/database generate
pnpm --filter=@fairy/database migrate:dev
pnpm --filter=@fairy/database db:seed   # 可选：写入演示数据（生产环境拒绝执行）

pnpm dev   # 经 turbo 同时启动 api :3000 与 web :5173
```

或用容器一条命令起全栈（需本机有 Docker，构建上下文为 `Fairy/`）：

```bash
cd Fairy && docker compose up --build   # api :3000、web :8080
```

联调必须双进程同时运行；改过 `.env` 或 Prisma schema 后重启 API 并重新 `generate`。完整排障见 [Fairy/README.md](Fairy/README.md) 与 [AGENTS.md](AGENTS.md) §9。

**不配任何 AI 密钥也能完整跑通**（2026-10-20 实测：注册 / 登录 / 影片库 47 部 / 对话全部通过，对话走规则降级仍返回真实推荐并带台词注入，日志零密钥泄露）。Agent 自动降级为规则/模板回复，全部管理功能可用。配好 `DEEPSEEK_API_KEY`（或 OpenAI/Claude）即获得真实对话、记忆抽取与推荐。

## 已交付能力（截至 2026-10-20）

- **Agent 对话**：SSE 真流式输出、意图识别（规则 + LLM 双保险）、prompt 注入消毒与不可信跨度标记、token 预算裁剪、IP 限流、多标签会话同步
- **门店业务**：影片 CRUD + 搜索、封面展示与详情模态、Fairy 拟人化形象与四态表情、经典台词注入推荐、借还（FOR UPDATE + CAS 并发安全）、租约列表、会话历史回放
- **画像与记忆**：画像 CRUD、记忆中心（LLM 抽取落库、pgvector 混合检索、管理面、用户自查面板、偏好反向回写 `likeGenres`）
- **运营**：行为流水、运营洞察看板、对话问数、主动运营建议（阈值检测 + 每日日报 + 调度器）
- **旅行规划**：对话行程生成 + REST 端点 + 历史回放 + 高德地图叠加（无 key 静默降级）+ 同行人画像注入 + step 级偏好依据可追溯
- **账号体系**：JWT + refresh token 旋转（事务内 CAS）、注册/登录限流、多标签同步
- **工程**：Dockerfile（api/web）+ docker-compose、部署清单、CI 门禁、演示种子数据（46 名 persona 用户/画像/记忆）

权威清单见 [PROJECT_STATUS.md](PROJECT_STATUS.md) Completed Modules。

## 文档导航

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | AI 工作宪法、确认门禁（§15）、联调 checklist |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 分层架构、工具调度、数据流、关键决策 |
| [API_CONTRACT.md](API_CONTRACT.md) | 全部端点、负载形状、错误码 |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | 状态、In Progress、Next Steps、风险 |
| [docs/requirements/](docs/requirements/README.md) | 需求文档与索引 |
| [Fairy/docs/deployment.md](Fairy/docs/deployment.md) | 部署清单与环境变量总表 |
| [Fairy/docs/prompts.md](Fairy/docs/prompts.md) | 系统提示词逐字快照 |
| [Fairy/docs/tools.md](Fairy/docs/tools.md) | Agent 工具注册表 |

## 已知缺口与后续事项

开发中的待办（FU-16 真实 embed 验收待配 key、种子数据提交、Docker 镜像未实测构建、日志表保留策略等）统一登记在 [PROJECT_STATUS.md](PROJECT_STATUS.md) 的 In Progress / Risks & Decisions。

演示账号口令仅限本地；上线前必须改密并配置生产密钥（见 [Fairy/docs/deployment.md](Fairy/docs/deployment.md)）。

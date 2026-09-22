# Fairy

Fairy 是一个集 AI 智能体（Agent）助理与录像带租赁门店管理系统于一体的产品。

- 前端：React + TypeScript + Tailwind CSS + Zustand
- 后端：Node.js + Express
- 数据库：PostgreSQL + Prisma
- AI：OpenAI / Claude 统一 SDK
- 测试：Vitest

## 项目结构

```
Fairy/
├── apps/
│   ├── web/                 # React + TypeScript 前端
│   └── api/                 # Node.js + Express 后端
├── packages/
│   ├── shared/              # 共享类型、schema 与工具
│   ├── ai-sdk/              # OpenAI / Claude 客户端封装
│   └── database/            # Prisma schema、迁移、seed 脚本
├── docs/                    # 架构与 API 文档
└── scripts/                 # 本地开发与部署脚本
```

## 快速开始

前置：Node.js 20+、Corepack（`pnpm` 版本以根 `package.json` 的 `packageManager` 为准）。

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量：把三个 example 复制为 .env 并填入本地值（密钥只留本地，永不提交）
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env

# 3. 生成 Prisma client（改过 schema.prisma 后必须重跑）
pnpm --filter=@fairy/database generate

# 4. 创建并迁移开发数据库（migrate:dev 会按需生成新迁移）
pnpm --filter=@fairy/database migrate:dev

# 5. 可选：写入种子数据（仅本地；生产环境 seed 会拒绝执行）
pnpm --filter=@fairy/database db:seed

# 6. 一条命令经 turbo 同时启动前后端（api :3000、web :5173）
pnpm dev
```

常见问题：

- `DATABASE_URL` 在 `apps/api/.env` 与 `packages/database/.env` **必须一致**；改过 `.env`
  或 Prisma schema 后，重启 API 并重新 `generate`（AGENTS §9）。
- 报 `ERR_PNPM_NO_PKG_MANIFEST`：命令要在 `Fairy/` 下执行（仓库根没有 workspace）。
- 只有 web 能打开而 `/api` 请求失败：API 没起，联调必须双进程（AGENTS §9）。

## 测试与校验

```bash
pnpm lint                 # ESLint
pnpm format:check         # Prettier
pnpm --filter=@fairy/api test
pnpm --filter=@fairy/web test
pnpm ci                   # 全量：lint + typecheck + test + build
```

真实库并发测试默认跳过；配置指向独立测试库（`fairy_test` 或 Neon branch）的
`TEST_DATABASE_URL` 后才会运行（AGENTS §7：禁止对开发库跑测试）。

## 文档

- [智能体规则（Agent Rules）](../AGENTS.md)
- [架构（Architecture）](../ARCHITECTURE.md)
- [API 契约（API Contract）](../API_CONTRACT.md)
- [项目状态（Project Status）](../PROJECT_STATUS.md)
- [部署清单（Deployment）](docs/deployment.md)
- [提示词快照（Prompts）](docs/prompts.md)
- [工具注册表（Tool Registry）](docs/tools.md)

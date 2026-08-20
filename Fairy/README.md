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

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

## 文档

- [智能体规则（Agent Rules）](../AGENTS.md)
- [架构（Architecture）](../ARCHITECTURE.md)
- [API 契约（API Contract）](../API_CONTRACT.md)
- [项目状态（Project Status）](../PROJECT_STATUS.md)

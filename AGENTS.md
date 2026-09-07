# Fairy — 智能体工作规则

本文件定义 AI 智能体在 **Fairy** 项目上工作时应遵守的规则。
Fairy 是一个集 AI 智能体（Agent）助理与录像带租赁门店管理系统于一体的产品。

- 前端：React + TypeScript
- 后端：Node.js + Express
- 数据库：PostgreSQL
- AI 供应商：OpenAI 与 Claude API

若本文件与明确的人类指令冲突，以人类指令为准。

---

## 0. 项目宪法（不可协商）

以下规则在任何情况下都不可绕过，除非获得项目负责人的书面或明确口头豁免。

- **工具使用权限（Tool-Use Authority）**：智能体必须一律通过工具调用（tool call）来操作业务系统（影片搜索、借阅、旅行规划）。**禁止**在对话中虚构数据，或绕过工具直接把结果输出给用户。
- **统一响应格式（Unified Response Format）**：所有 API 响应必须遵循 `{ code, data, msg }` 结构，不允许任何其他结构。
- **密钥隔离（Secret Isolation）**：所有敏感信息（API 密钥、数据库密码、JWT 密钥等）必须通过环境变量注入。禁止以任何形式硬编码密钥。
- **状态文档同步（Status Document Synchronization）**：每完成一个功能，必须更新 `PROJECT_STATUS.md`，确保项目状态与代码进度保持一致。
- **OpenSpec 流程（OpenSpec Process）**：跨模块、架构或公共 API 契约变更须遵循 OpenSpec 工作流（Propose → Apply → Archive）；单模块小功能可走 Trellis + `docs/requirements/` 路径。具体门禁见 **§15**。
- **数据一致性优先（Data Consistency First）**：涉及库存、租赁、画像等核心业务状态的变更，必须在数据库事务内执行，以确保原子性与最终一致性。
- **用户体验保障（User Experience Safeguard）**：所有 AI 生成的内容，在触达用户之前必须通过可信度校验或优雅降级处理。禁止向用户暴露原始错误堆栈或模型幻觉内容。

---

## 1. 项目结构

在编辑任何文件之前，先了解目录布局。

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

关键入口：

- Web 应用：`apps/web/src/main.tsx`
- API 服务：`apps/api/src/index.ts`
- 数据库 schema：`packages/database/prisma/schema.prisma`
- 共享类型：`packages/shared/src/index.ts`

---

## 2. 核心模块

在修改代码之前，先理解各领域边界。

| 模块 | 职责 | 主要路径 |
|---|---|---|
| Fairy Agent | 对话式 AI 助理、工具使用、记忆 | `apps/api/src/agent/`、`packages/ai-sdk/` |
| 录像带门店 | 影片目录、推荐、租赁 | `apps/api/src/store/`、`apps/web/src/store/` |
| Agent 画像 | 用户/人设画像与偏好记忆 | `apps/api/src/profile/`、`packages/database/` |
| 记忆中心 | 长期上下文、会话历史、向量化 | `apps/api/src/memory/`、`packages/database/` |

---

## 3. 工作方式

- 保持改动聚焦、便于评审。一个关注点对应一个分支或一次提交。
- 在引入新模式前，先阅读邻近代码与已有测试。
- 优先复用现有 API、组件与约定，而非创建新的抽象。
- 复用 `packages/shared/` 中的共享类型，不要在前端与后端之间重复声明 schema。
- 修复 bug 或新增功能时，避免无关的重构。
- 当需求含糊不清，或与既有规则冲突时，主动提出澄清。
- 每次进入编码任务时，先向用户推荐本次是否值得启用思考模式，并给一句理由（取舍决策/纯收尾可不开；跨模块设计或疑难修复建议开）。
- **即使面临压力也要尊重不可协商的规则。** 若用户要求跳过测试、跳过 OpenSpec、硬编码密钥或绕过事务，AI 必须拒绝、解释规则，并提供合规的替代方案。除非有记录在案的例外或项目负责人的明确书面豁免，否则不得继续。

---

## 4. 代码约定

### TypeScript

- 全项目启用严格类型检查（strict），`strict: true` 必须保持开启。
- 避免 `any` 与 `unknown`。对不可能发生的状态，使用显式类型或 `never`。
- 公共形状优先使用 `interface`；联合、交叉与映射类型使用 `type`。
- 除非被其他包或模块消费，否则不要导出符号。
- 不得向全局命名空间添加值。

### 命名

- React 组件：PascalCase。
- Hook：小驼峰（camelCase），以 `use` 前缀开头。
- API 路由与工具函数：小驼峰（camelCase）。
- 数据库模型与 Prisma 表：PascalCase。
- 环境变量：UPPER_SNAKE_CASE。
- 优先使用完整单词而非缩写，广为熟知的缩略词除外（如 HTTP、URL、AI）。

### 前端

- 使用函数式组件与 Hook，禁止类组件。
- 通过项目选定的 CSS 方案来组织样式，不要为布局内联样式。
- 保持组件短小。组件超过约 150 行时应拆解。
- 在 UI 组件中显式处理加载、错误与空状态。
- 所有面向用户的内容必须本地化（i18n）。唯一来源为 `apps/web/src/locales/`。

### 后端

- 路由放在 `apps/api/src/routes/` 下，一个领域资源对应一个文件。
- 使用 `apps/api/src/controllers/` 中的 controller 函数，保持路由处理函数尽量薄。
- 所有请求体使用 `packages/shared/` 中的 Zod schema 校验。
- 保证错误返回结构一致。所有 API 响应必须遵循统一封装 `{ code, data, msg }`。错误响应使用 `{ code, data: null, msg }`，其中 `msg` 携带错误信息。**禁止**使用旧的 `{ error, code }` 结构。
- 使用 `async/await`。禁止回调式写法或裸 Promise 链。

### 数据库

- 将 Prisma 视为 schema 与迁移的唯一来源。
- 每个 schema 变更都必须生成一次迁移。
- 迁移命名要具备描述性，例如：`add_memory_embeddings`、`create_rental_table`。
- 修改多行相关数据时使用事务。
- 为用于过滤、连接与排序的列建立索引。复合索引请在注释中说明。
- 数据库测试**必须**针对独立测试库（约定命名：`fairy_test`）运行，或在事务内运行并在测试后回滚。禁止针对开发库运行测试。

---

## 5. AI 集成规则

- 将供应商特化逻辑封装在 `packages/ai-sdk/` 内，其他代码从该包消费统一接口。
- 统一 AI SDK 接口**至少**要暴露以下操作：`chat()`、`embed()`、`stream()`，以及供应商无关的 token 用量元数据（`promptTokens`、`completionTokens`、`totalTokens`）。
- 同时支持 OpenAI 与 Claude。除 SDK 包外，禁止硬编码供应商特化的模型或参数。
- 新增供应商时只允许扩展 SDK 包，任何消费方代码都不应变更。
- 仅在环境变量中存储 API 密钥。任何情况下不得提交密钥或占位凭证。
- 在将用户输入发送给 AI 供应商前进行清洗。
- 记录 AI 供应商错误时，不得暴露可能包含敏感数据的响应负载。
- 在 `apps/api/src/agent/usage.ts` 中实现 token 用量跟踪。
- 在安全的前提下缓存 embedding 与高频上下文，并记录缓存失效规则。

---

## 6. 记忆与画像规则

- 将智能体记忆作为结构化记录存储在 PostgreSQL 中；仅用于 embedding 检索时才使用向量扩展。
- 每一条记忆记录都必须关联 `profileId`，可选关联 `sessionId`。
- 尊重隐私边界：未经画像中显式同意标记，不得持久化敏感用户数据。
- 使用记忆中心进行检索、排序与上下文窗口管理。不要在 agent controller 中内联记忆查询。
- 若记忆中心模块尚未实现，仅当带有 `TODO(memory-center):` 注释且在 `PROJECT_STATUS.md` 中登记为技术债时，才允许临时的内联查询。
- 画像更新必须是原子的且幂等的。

---

## 7. 测试规则

- 每次 bug 修复与功能开发都要新增或更新测试。
- 前端：将测试放在源文件旁边，命名为 `*.test.tsx`。
- 后端：将测试放在 `apps/api/src/__tests__/` 下，镜像上层源码结构。
- 数据库：使用独立测试库，或在多次测试之间通过 Prisma 事务回滚。
- 在单元测试中 mock 外部 AI 供应商。禁止在 CI 中调用真实的 OpenAI 或 Claude API。
- 优先使用确定性的断言。除非必要，避免断言精确的日志文本或时间戳。
- 测试数据库配置应放在环境变量中。测试运行使用 `DATABASE_URL=postgresql://.../fairy_test`，并确保与开发库 URL 明确区分。

### 验证命令

针对改动范围运行最贴近的相关命令：

```bash
# 类型检查
pnpm --filter=@fairy/web typecheck
pnpm --filter=@fairy/api typecheck

# Lint 与格式化
pnpm lint
pnpm format:check

# 测试
pnpm --filter=@fairy/web test
pnpm --filter=@fairy/api test

# 数据库
pnpm --filter=@fairy/database migrate:status
pnpm --filter=@fairy/database generate
```

仅当改动范围较大或跨包时，才运行完整验证：

```bash
pnpm ci
```

---

## 8. Setup Commands（安装与启动命令）

新人或需重建本地环境时，运行以下命令即可完成安装、准备数据库并启动两个应用：

> **工作目录：** 以下命令均在 **`Fairy/`** 下执行（仓库根 `Fairy-help/` 没有 `package.json`，直接运行会报 `ERR_PNPM_NO_PKG_MANIFEST`）。

```bash
cd Fairy   # 或终端打开时直接 cd 到 Fairy-help/Fairy

# 安装全部依赖
pnpm install

# 生成 Prisma client
pnpm --filter=@fairy/database generate

# 创建并迁移开发数据库
pnpm --filter=@fairy/database migrate:dev

# 写入种子数据（可选）
pnpm --filter=@fairy/database db:seed

# 分别以后台方式启动 API 与 Web
pnpm --filter=@fairy/api dev
pnpm --filter=@fairy/web dev

# 或一条命令经 turbo 同时启动前后端（推荐日常联调用）
pnpm dev
```

> 先确认 `apps/api/.env.example` 与 `apps/web/.env.example` 中的必需环境变量已在本地复制为 `.env` 并填写（密钥只留本地，永不提交）。

---

## 9. Dev Environment Tips（本地开发提示）

在 monorepo 中高效工作，务必注意以下事项：

- **Monorepo 根目录是 `Fairy/`**：所有 `pnpm --filter=...` 命令在 `Fairy/` 下运行；仓库根 `Fairy-help/` 无 workspace，会报 `ERR_PNPM_NO_PKG_MANIFEST`。
- **优先用 `--filter` 而非进入 `apps/*` 子目录**：运行某个 workspace 的命令时使用 `pnpm --filter=<workspace> ...`，不要 `cd` 进 `apps/api` 或 `apps/web` 再执行，以免依赖解析与类型检查错位。
- **新增包先 `pnpm install`**：创建新的 `packages/*` 或 `apps/*` 时，先运行 `pnpm install --filter=<new_package>`，让 Vite、ESLint、TypeScript 都能解析到它，再开始写代码。
- **改动 `packages/shared` 后重新 typecheck**：改完共享类型或 Zod schema，需对依赖它的 app 重新跑类型检查（例如 `pnpm --filter=@fairy/web typecheck`）。
- **改 Prisma schema 必须 `generate`**：调整 `schema.prisma` 后，先 `pnpm --filter=@fairy/database generate` 再运行 web/api，否则类型不匹配会报错。
- **启动/重启 dev server**：依赖变更或 Prisma client 重新生成后，重启对应 dev server 以让变更生效。
- **端口冲突**：web 与 api 使用不同端口；若端口被占用，先从占用进程排查，而非硬改配置。
- **联调须双进程**：本地验证前后端集成时，api(:3000) 与 web(:5173) **必须同时运行**。推荐在 `Fairy/` 下一条命令 `pnpm dev`（根 turbo 编排同时拉起两者，Ctrl+C 一并停止；turbo.json 用 `tasks` 声明，见 ARCHITECTURE §10）；也可分别跑 `pnpm --filter=@fairy/api dev` 与 `pnpm --filter=@fairy/web dev`。仅启动 web 会导致 Vite 代理 `/api` 失败（常见表现为空 JSON 或 500）。
- **双份 `DATABASE_URL` 须一致**：Prisma 使用 `packages/database/.env`；API 使用 `apps/api/.env`。两处 `DATABASE_URL` **必须相同**。只改一处会导致 migrate/seed 成功但 API 连错库或报 P1001。
- **改 `.env` 后重启 API**：环境变量变更后须重启 `pnpm --filter=@fairy/api dev`，web 通常无需重启。

---

## 10. Git、分支与 Pull Request 规则

- 保持提交原子化、描述清晰，使用现在时、祈使语气。
- 提交信息格式：`<scope>: <short description>`，例如：
  - `agent: add tool selection for rental queries`
  - `store: fix recommendation pagination`
  - `db: add profile preference columns`
- 分支命名建议：`<scope>/<short-description>` 或 `feature/<slug>`。
- 打开 PR 前，运行与改动范围匹配的最贴近验证命令（见 §7），并确保通过。
- PR 描述**必须**引用相关的 OpenSpec 提案，或说明本次为紧急 bug 修复。
- 不允许合并带有失败检查或未处理评审意见的 PR。
- 除非明确要求，否则不得添加 AI 生成的 co-author 署名。

---

## 11. 禁止的模式

- 禁止 `any` 类型，但临时迁移脚本中带显式注释的除外。
- 禁止前端与后端之间重复校验逻辑，应使用 `packages/shared/`。
- 禁止在 `packages/ai-sdk/` 之外直接导入 AI 供应商客户端。
- 禁止不带参数化的原始 SQL。
- 禁止在请求处理函数中同步执行文件系统或网络调用。
- 禁止在日志、错误信息或测试快照中出现密钥。
- 禁止用重型计算阻塞主线程，应卸载到 worker 或后台任务。
- 没有 `docs/features/` 中相应文档时，禁止启用功能开关（feature toggle）。

---

## 12. 文档

- 变更架构、环境要求或公共 API 时，更新 `docs/`。
- 在 `apps/api/.env.example` 与 `apps/web/.env.example` 中登记新的环境变量。example 文件**只能**包含占位值或空值，**严禁**提交真实密钥。
- 应用启动时校验必需环境变量。新增必需变量时，同时更新 `.env.example` 与启动校验代码。
- 保持 API 文档与路由变更同步。
- 尽量在模块旁放置 README，提供局部上下文。

---

## 13. 文档治理（文档脊柱）

Fairy 采用文档治理脊柱。以下四个核心文档分别是各自领域的唯一来源。代码必须遵循它们；当二者出现漂移时，以文档为准，并将不一致之处上报给项目负责人。

### 13.1 核心文档

| 文档 | 职责 | 唯一来源为 |
|---|---|---|
| `AGENTS.md` | AI 行为宪法与项目级规则。 | 智能体在本项目上如何工作；不可协商的约束。 |
| `ARCHITECTURE.md` | 系统架构、模块边界与数据流。 | 代码归属、组件如何交互、数据如何流动。 |
| `API_CONTRACT.md` | 所有 HTTP API 定义与负载形状。 | 前后端集成；请求/响应格式。 |
| `PROJECT_STATUS.md` | 项目阶段、已完成工作、进行中项、风险与决策。 | 当前项目状态与下一步优先级。 |

### 13.2 更新规则

| 代码变更 | 需要更新的文档 |
|---|---|
| 新增 AI/agent 行为或工作流 | `AGENTS.md`（含 §15）、`ARCHITECTURE.md` |
| 新增/变更模块、服务或数据流 | `ARCHITECTURE.md` |
| 新增/变更 API 端点或负载 | `API_CONTRACT.md` |
| 功能完成、阶段变化或发现风险 | `PROJECT_STATUS.md` |
| 新增环境变量或密钥 | `AGENTS.md`（安全规则）、`.env.example`、相关文档 |
| 脚手架或工程基建变更（CI、构建配置、monorepo task） | `ARCHITECTURE.md`、`PROJECT_STATUS.md` |
| 已确认但尚未进入开发的需求 | `docs/requirements/`、`PROJECT_STATUS.md` |

- 只有当所有受影响的脊柱文档都已完成更新，PR 或代码变更才算完整。
- 在相关代码与文档合并之前，不得在 `PROJECT_STATUS.md` 中把任务标记为完成。
- 若某改动会影响一份**已归档**的 OpenSpec 提案，应新建 `/opsx:propose`，而非直接编辑归档文件。

### 13.3 智能体行为约束

- 修改代码前，智能体**必须**查阅相关脊柱文档。
- 当代码与脊柱文档不一致时，以文档为准。智能体必须：
  1. 遵循文档。
  2. 将不一致之处上报给项目负责人。
  3. 未经明确批准，不得悄悄改写文档去迁就代码。
- 若必需的文档缺失或含糊，暂停并先向负责人澄清，再继续。

### 13.4 需求文档化

已确认、但尚未进入 OpenSpec 的需求，必须整理为结构化需求文档：

- 新需求摘要保存为 `docs/requirements/YYYY-MM-DD-<feature-slug>.md`。
- 至少包含：背景/问题、目标、范围、非目标、受影响模块、验收标准、待决问题。
- 把需求加入 `docs/requirements/README.md` 索引，并在 `PROJECT_STATUS.md` 的 **In Progress** 或 **Next Steps** 中登记（视适用情况而定）。
- 开发获批后，将需求摘要提炼为正式 OpenSpec 提案 `docs/openspec/proposals/YYYY-MM-DD-<feature-slug>.md`。不要删除原始需求文档，并从该文档中链接到提案。

### 13.5 PROJECT_STATUS.md 格式

`PROJECT_STATUS.md` **必须**包含以下顶层节：

- **Project Phase（项目阶段）** — 当前阶段（如 Planning、Scaffolding、Development、Stabilization）。
- **Completed Modules（已完成模块）** — 已交付功能列表，含完成日期与归档的 OpenSpec 提案链接。
- **In Progress（进行中）** — 当前正在实现的功能，含负责人与阻塞项说明（如有）。
- **Next Steps（下一步）** — 后续功能或任务，按优先级排序。
- **Risks & Decisions（风险与决策）** — 未决风险、权衡与已做决策。
- **Last Updated（最近更新）** — 最近一次更新的 ISO 日期（`YYYY-MM-DD`）。

新完成的功能添加到 **Completed Modules** 顶部，并在归档时将其移出 **In Progress**。

---

## 14. 安全与密钥

- 永不提交 `.env` 文件、API 密钥、数据库密码或 JWT 密钥。
- 使用 `process.env` 读取密钥。启动时校验必需环境变量。
- 使用 bcrypt 或 Argon2 哈希密码。任何情况下不得明文存储凭证。
- 通过 Prisma 清洗 SQL 输入；原始查询必须强制参数化。
- 对所有文件上传做类型与大小校验。将用户上传文件存放在 web 根目录之外。
- 生产环境通过 Helmet 设置安全的 HTTP 响应头。
- 生产环境的错误响应不得暴露堆栈跟踪或内部路径。

---

## 15. Agent Approval Gates（智能体确认门禁）

本节是智能体**何时可以改产品代码**的唯一脊柱来源。`grill-me` skill、Trellis workflow 与本节冲突时，以本节为准。

### 15.1 新功能：双轨实现路径

| 轨道 | 适用 | 批准门禁 | 实现前还须 |
|---|---|---|---|
| **Trellis 轨** | 小功能：单 app 或单 package、不改动 `API_CONTRACT.md` 公共契约、不涉及跨模块架构变更 | `docs/requirements/` 文档 Status 为 **approved** | Trellis task 已建；用户审阅 task artifacts；`task.py start` 已执行 |
| **OpenSpec 轨** | 大变更：跨 web + api + shared + db、改 `ARCHITECTURE.md` 边界、改公共 API 请求/响应形状 | `docs/openspec/proposals/` 提案 **approved** | 可并行 Trellis 跟踪，但不得跳过 OpenSpec 批准 |

**流程（Trellis 轨）：** grill-me 收敛 → 写入 `docs/requirements/` → 用户 **approve** → 创建 Trellis task → 审阅 PRD/design → `task.py start` → 实现。

**流程（OpenSpec 轨）：** 需求摘要（可来自 grill-me）→ OpenSpec 提案 → 用户 **approve** → Apply → Archive。

在未获对应轨道批准前，**禁止**编写或修改产品代码（apps、packages 业务逻辑、Prisma schema 迁移、面向用户的 UI）。

### 15.2 分级豁免（非新功能）

| 级别 | 场景 | 智能体行为 | 事后记录 |
|---|---|---|---|
| **P0** | 服务不可用、数据错误、阻塞**已批准功能**验收（如 API 500、错误 `DATABASE_URL`、迁移失败） | 可直接修复；改前一句话说明范围即可 | 会话结束前写入 Trellis journal（`/trellis:finish-work`） |
| **P1** | 非阻塞改进（错误提示、空状态、联调 UX） | 改前须向用户**说明范围**并获口头确认 | 同上，或 `.trellis/spec/` 若形成可复用约定 |
| **新功能** | 任何新增能力或超出已批准 REQ 的范围 | **不得**使用豁免；走 §15.1 完整门禁 | — |

本地 `.env` 同步、双 dev server 启动属于 **§9 运维**，不算产品代码变更；但仍须在改 `.env` 后重启 API。

### 15.3 过程记录矩阵

| 内容类型 | 写入位置 |
|---|---|
| 项目踩坑、联调教训、任务收尾复盘 | Trellis journal（`.trellis/workspace/<developer>/`，通过 `/trellis:finish-work`） |
| 方法论、个人学习笔记 | `学习过程.md`（非脊柱，AI 不强制加载） |
| 团队可执行编码约定 | `.trellis/spec/` 或本节 / §9 |

需求与决策摘要统一使用 `docs/requirements/`（**不**使用 `docs/decisions/`）。

### 15.4 本地联调 Checklist

联调或验收已批准功能前，智能体须确认：

1. `pnpm --filter=@fairy/api dev` 与 `pnpm --filter=@fairy/web dev` **均在运行**
2. `packages/database/.env` 与 `apps/api/.env` 的 `DATABASE_URL` **一致**
3. 近期改过 `.env` 或 Prisma schema 时，已 **重启 API** 且已 `pnpm --filter=@fairy/database generate`（若 applicable）

详见 **§9 Dev Environment Tips**。

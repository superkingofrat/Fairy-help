# 2026-09-22 部署落地批次（批次 7）会话记录

分支 `chore/reliability-fixes`（基于 master `c71c135`，未推送）。8 个提交：`40bfd4e`、`f814ea9`、`9bc90a3`、`0c0e3d1`、`005d826`、`e76962e`、`41da6fe`、`ed2a737`。范围经负责人「继续」确认（路线图批次 7，五项各自独立提交），均属 AGENTS §15.2 P1 豁免。

## 本轮完成

### 1. `40bfd4e` db: refuse to run the seed in production

- 守卫放在 demo 口令常量之后、`main()` 之前的模块级：检测 `NODE_ENV === "production"` 即打错误并 `exit(1)`。位置关键——PrismaClient 构造是懒连接，拒绝发生在任何 DB 连接之前（子进程实测 435ms 退出，永不到达不可达的测试 URL）。
- `seedGuard.test.ts` 走子进程（`execFileSync(node --import tsx prisma/seed.ts)`），强制注入不可达的 `DATABASE_URL`：「production 拒绝」用例断言退出码 1 + stderr 含 `refusing to seed`；「NODE_ENV 未置不误伤」用例断言 stderr 不含该文案（在连接层失败，本地开发惯例不设 NODE_ENV 不被误伤）。
- `NODE_ENV` 未置的 env 构造必须过滤 `undefined` 值（`{...process.env}` 的元素类型是 `string | undefined`，直接传给 `Record<string,string>` 的 exec env 会 TS2345）——`Object.fromEntries(entries.filter(...))` 后再 `delete env.NODE_ENV`。

### 2. `f814ea9` api: verify no oversell under concurrent borrows with a real database

- `rentalService.concurrency.test.ts`：`TEST_DATABASE_URL ? describe : describe.skip` 门控，CI 与本地默认整体跳过。
- 断言设计：库存 5、20 个不同用户 `Promise.allSettled` 并发 borrow；恰好 5 笔成功、其余全部 `OUT_OF_STOCK`、成功者的 `remainingStock` 排序后恰为 `[0,1,2,3,4]`（互不相同即证明无重复扣减）、终态库存归零且活跃租约数 == 5。
-  cleanup 顺序：rentals(by movieId) → users → movie，最后 `$disconnect` 单例（避免 vitest worker 被残留连接池拖住）。
- 顺序 for 循环建 20 个 user（`Array.from({length}, (_unused, i))` 的未用参数在 eslint 下不稳，顺序建也够快）。

### 3. `9bc90a3` chore: add api and web Dockerfiles

- 两个 Dockerfile 的构建上下文都是 monorepo 根 `Fairy/`；builder 统一：corepack 固定 `pnpm@9.0.0`（对齐根 `packageManager`，不用镜像自带版本）→ 仅拷贝 5 个 workspace manifest + lockfile 的分层 `--frozen-lockfile` install → `pnpm --filter @fairy/database generate` → turbo 拓扑构建（`--filter "@fairy/api..."` / `"@fairy/web..."`，尾随三点带上依赖）。
- api runtime（node:20-alpine）：`ENV NODE_ENV=production TZ=Asia/Shanghai` + `apk add tzdata openssl`——`TZ` 只是环境变量，没有 zoneinfo 文件时 `Date` 仍按 UTC 走（ARCHITECTURE §8 TZ 决策的容器化落地）；prisma 查询引擎在 musl 上动态链接 openssl。`USER node` 非 root；HEALTHCHECK 用 busybox wget 探 `/health`。
- 拷贝策略：整棵 `node_modules`（含 `.pnpm` 内部相对符号链接）+ 各 workspace 的 `node_modules`/`dist`/`package.json`，保持 `/app` 下相同相对深度——`@fairy/*` 工作区依赖与已生成的 prisma client 才可解析。
- web runtime（nginx:alpine）+ `apps/web/nginx.conf`：SPA `try_files` 兜底、`/assets/` 一年 `immutable`、app shell `no-cache`、gzip。`VITE_API_URL` 做成 build ARG → build 前注入 ENV：前端是 `${API_BASE}${path}` 前缀拼接（`http.ts:4`），值不带尾斜杠、不带 `/api`；留空 = 同源相对路径（配合反代）。
- `.dockerignore`（`Fairy/` 根）：排除 `**/node_modules`、`**/dist`、`.git`、`.trellis`、`**/.env`、`**/.env.*`、docs、`*.md`——密钥不进构建上下文（§14），prisma schema/migrations 不被误伤。
- **本环境无 Docker，镜像未实际构建**：只做静态核对（所有 COPY 路径存在、workspace 成员恰为 staged 的 5 个 manifest、引用的脚本名在 package.json 中存在、`@prisma/client` 经 `@fairy/database` 再导出枚举）。已登记 PROJECT_STATUS 风险，首次部署前须实际构建冒烟。

### 4. `0c0e3d1` db: add migrate deploy script

- `packages/database` 补 `"migrate:deploy": "prisma migrate deploy"`：部署清单引用它做「先于新容器启动」的迁移；`migrate:deploy` 只应用未执行迁移、不 reset、可重复执行。
- 取舍：迁移从源码检出/CI 跑，不塞进 app 镜像（prisma CLI、schema、migrations 不属运行时必需；镜像里跑 CLI 还要处理 `.pnpm` 哈希路径，脆弱）。

### 5. `005d826` docs: add deployment checklist

- `docs/deployment.md` 八节：构建（含 `VITE_API_URL` build-time 语义）→ 迁移先行 → 运行 API（`JWT_SECRET` 启动强校验、`/health`）→ 运行 web（两种拓扑：同源反代 `/api` 推荐 / 异源 `VITE_API_URL`）→ `TRUST_PROXY_HOPS` 反代跳数表（默认 1；直连 0）→ 环境变量总表 → 运维红线（seed 生产拒绝、demo 口令、日志无密钥、升级顺序）→ 发布后验证清单。
- 环境变量总表逐行对过代码：`factory.ts` 的 `API_KEY_VARS`/`BASE_URL_VARS`（发现 `DEEPSEEK_BASE_URL`/`OPENAI_BASE_URL`/`ANTHROPIC_BASE_URL` 代码读取但 `.env.example` 未登记——顺手补登，§12），`embeddingClient.ts` 的 `EMBEDDING_*` 回落链，`amapClient.ts` 缺失 key 返回 null 降级不抛错（核对过源码才写进文档）。

### 6. `e76962e` docs: document the agent prompts

- `docs/prompts.md`：调用链总览 + 公共约束表（JSON-only 契约 / `sanitizeUserInput` / `wrapUntrustedSpan` 不可信跨度 / `tryChat` 静默降级）+ 三个系统提示词**逐字**快照 + 各自的规则/模板降级路径 + 变更规则（改提示词 = agent 行为变更，走 §15.1 门禁并同步测试与本文档）。
- 逐字性用脚本验证：node 提取源码模板字符串与文档 `text` 围栏逐字节对比，三例全 `VERBATIM-OK`（首轮抓到 extract prompt「规则：」后多一空行，已修）。

### 7. `41da6fe` docs: document database setup in the readme

- README「快速开始」补齐六步（install → 复制三份 `.env` → generate → migrate:dev → 可选 db:seed → `pnpm dev`）+ 常见问题（双 `DATABASE_URL` 一致、根目录无 workspace、双进程联调）+ 测试命令段（含 `TEST_DATABASE_URL` 说明）+ 文档链接补 `deployment.md`/`prompts.md`/`tools.md`。
- 新建 `packages/database/.env.example`（AGENTS §9 一直引用但仓库里不存在）；引用的根脚本（`lint`/`format:check`/`ci`）核对存在才写入。

### 8. `ed2a737` docs: sync spine for the deployment batch

- ARCHITECTURE §8 新增三决策行（容器化拓扑含 tzdata/TZ 理由与非 root、seed 生产防护、真实库并发测试门控）+ §9 docs 树补 `deployment.md`、`prompts.md` 注明逐字快照 + §10 CI 门禁段补 `TEST_DATABASE_URL` 跳过说明。
- AGENTS §7 补真实库并发测试约定：`TEST_DATABASE_URL` 必须指向独立测试库、先改环境变量再动态 import（把本轮最大的坑写成团队约定）。
- PROJECT_STATUS 五节：Completed Modules 顶部批次 7 条目、Next Steps 批次 7 标完成、Risks 新增「Docker 镜像未经实际构建」、Decisions 补 3 行、Last Updated 新条目。

### 验证

- `pnpm run ci`（lint → typecheck → test → build）5/5 任务通过；api 344 passed + 1 skipped（并发用例门控跳过）/ web 103 / shared 99 / database 6 / ai-sdk 16 全绿；prettier `format:check` 通过。
- 提示词逐字快照脚本校验三例通过；`.env.example`/部署清单/env 总表三处对齐；本环境无 Docker，镜像构建未验证（见 Risks）。

## 踩坑记录

1. **顶层静态 import 会在 env 就绪前绑定单例的 DATABASE_URL**：并发测试第一版 `import { Mood, Scene, PrismaClient } from "@fairy/database"` 在模块顶层——模块加载即构造 prisma 单例、读的是开发库 URL，`beforeAll` 里再改 `process.env.DATABASE_URL` 已经太晚，`borrow` 会打开发库（而自建 PrismaClient 指向测试库，setup 与 borrow 分家、结果全 `MOVIE_NOT_FOUND`）。改法：所有 `@fairy/database` 引用（连枚举值）全部动态 import，类型用 `typeof import("@fairy/database")` 不落运行时。凡「运行时 env 决定模块行为」的测试都有这个陷阱，已写进 AGENTS §7。
2. **prettier 会重排 markdown 续行，「逐字快照」必须进代码围栏**：prompts.md 第一版把提示词当普通段落，prettier 把列表续行缩进两格，逐字性被破坏；改 ` ```text ` 围栏后格式器不碰内容。配套用 node 脚本逐字节对比源码与文档 fence 才抓住了 extract prompt 多出的空行——声明「逐字」就要有校验，不能靠眼看。
3. **`git commit --amend` 改的是 HEAD，不是想并入的那个提交**：format 之后想把 `deployment.md` 的格式化改动并入 `docs: add deployment checklist`，直接 amend 却并进了 README 提交（消息与内容不符）。本地未推送 → `git reset <Dockerfiles 提交>`（mixed，工作区不动）→ 按原顺序四连提交重建，历史恢复原子。改已推送历史才需要 rebase；本地重建更干净。
4. **lint 细节**：`let userIds`（只 push 不 reassign）触发 `prefer-const`；`Array.from({length}, (_unused, i))` 的未用参数在 strict eslint 下不稳——顺序 for 循环两个问题一起避开。

## 未完成 / 后续

- **Docker 镜像未实际构建**（本环境无 Docker）：静态核对已做，首次部署前须在有 Docker 的环境 `docker build` 两个镜像并冒烟 `/health` 与 web SPA（清单见 `docs/deployment.md` §8，已登记 PROJECT_STATUS 风险）。
- **真实库并发测试未对真实库跑过**：CI 与本地均未配 `TEST_DATABASE_URL`（按设计跳过）；首次配置 `fairy_test`/Neon branch 时跑一次确认 5/15 断言。
- **`classifyIntent` 的历史注入不走 token 预算裁剪**（上轮遗留，已登记风险，未处理）。
- **真实库 seed role 迁移验证**（上轮遗留）：下次 `db:seed` 时确认 `user@fairy.local` 变为 agent 后行程规划可用。
- 全部提交在本地分支 `chore/reliability-fixes`，**未推送**（推送需负责人明确指示）。

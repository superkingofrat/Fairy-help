# 部署清单（Deployment）

本文是 Fairy 生产落地的唯一操作清单：镜像构建、数据库迁移、运行参数、反代与运维红线。
前端 (`apps/web`) 与 API (`apps/api`) 各自一个镜像，数据库建议托管 Postgres（Neon）。
所有密钥只经运行时环境变量注入，**不进镜像、不进 git**（AGENTS §14）。

## 1. 构建镜像

构建上下文是 monorepo 根目录 `Fairy/`（两个 Dockerfile 都按此编写）：

```bash
cd Fairy

docker build -f apps/api/Dockerfile -t fairy-api:latest .

# VITE_API_URL 在构建期内联进静态产物，必须在 build 时给定；留空 = 同源相对路径
# VITE_AMAP_JS_KEY（高德浏览器端安全密钥，referrer 防盗链）同为 build-time 内联；
# 不传则前端行程地图静默不渲染，不影响其余功能
docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_AMAP_JS_KEY=your_amap_js_key_here \
  -t fairy-web:latest .
```

要点：

- `VITE_API_URL` 是 **build-time** 变量（Vite 内联 `import.meta.env`）。换域名必须重新 build
  web 镜像，运行时改环境变量无效。取值形如 `https://api.example.com`（不带尾斜杠、不带
  `/api` 路径——路径由前端自行拼接）。
- `VITE_AMAP_JS_KEY` 同为 **build-time** 变量：行程地图经浏览器端高德 JS API 渲染，
  key 必须是高德控制台的「Web端(JS API)」安全密钥并配置 referrer 防盗链白名单；
  服务端 `AMAP_SERVER_KEY` 严禁出现在任何前端产物（AGENTS §14）。不传该 build arg 时
  地图区域整体不渲染（静默降级），文字行程与核实徽标不受影响。
- `.dockerignore` 已把 `node_modules`、`dist`、`.env*`、`.git` 排除出上下文：镜像内重新
  `pnpm install --frozen-lockfile` 与 build，本地依赖与本地密钥不会被打进镜像。
- api 镜像内已 `ENV NODE_ENV=production`、`ENV TZ=Asia/Shanghai`，以非 root 用户 `node`
  运行；`TZ` 依赖镜像内的 `tzdata` 生效（时区语义见 ARCHITECTURE §8 决策行）。

## 2. 数据库迁移（先于新容器启动）

迁移从**源码检出**执行，不放进 app 镜像（镜像只含运行时产物；prisma CLI、schema 与
migrations 目录不属于运行时必需项）：

```bash
cd Fairy
DATABASE_URL='postgresql://...' pnpm --filter=@fairy/database migrate:deploy
```

`migrate:deploy` 只应用未执行过的迁移，不生成新迁移、不reset，可重复执行；放进发布流水线、
**新 api 容器启动之前**跑。本地开发用 `migrate:dev`（AGENTS §8）。

数据库连接串注意：

- Neon 等托管库用 **pooled** 连接串，并带 `connect_timeout=15&pool_timeout=15`，
  避免 compute 冷启动唤醒期间（默认 5s 超时）误判为「数据库挂了」（AGENTS §9）。
- `packages/database/.env`（本地）与 `apps/api/.env`（API 进程）的 `DATABASE_URL`
  不一致是常见联调事故，部署时同样只有**一个**权威来源：运行时注入的 `DATABASE_URL`。

## 3. 运行 API

```bash
docker run -d --name fairy-api -p 3000:3000 \
  -e DATABASE_URL='postgresql://...' \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e AI_PROVIDER=deepseek \
  -e DEEPSEEK_API_KEY='...' \
  fairy-api:latest
```

- `JWT_SECRET` 缺失时容器会立即退出（启动时强校验，见 `apps/api/src/index.ts`）。
- 健康检查：`GET /health`，镜像内已带 HEALTHCHECK（busybox wget，30s 间隔）。
- AI 全部密钥缺失不会导致服务不可用：对话回落到规则/模板回复（优雅降级，AGENTS §0），
  但这不应作为生产的常态——配好至少一个供应商密钥。

## 4. 运行 Web（nginx）

```bash
docker run -d --name fairy-web -p 8080:80 fairy-web:latest
```

- 镜像内置 `apps/web/nginx.conf`：SPA `try_files` 兜底、`/assets/` 一年强缓存（带内容哈希）、
  app shell `no-cache`、gzip。默认监听 80。
- web 镜像**不**代理 `/api`。生产用两种拓扑二选一：
  1. **同源**（推荐）：反代把 `https://app.example.com/api/*` 转给 api 容器，web 的
     `VITE_API_URL` 留空。证书、CORS、同源策略全部简化。
  2. **异源**：`VITE_API_URL=https://api.example.com`，需自行处理 CORS 与两个域名证书。

## 5. 反代与限流（TRUST_PROXY_HOPS）

API 限流按客户端 IP 分桶。反代之后若仍按 socket IP 计量，**全站用户会共享一个桶**
（chat 每分钟仅 30 次）。`TRUST_PROXY_HOPS` 声明前面有几跳反代，默认 1：

| 部署形态                       | TRUST_PROXY_HOPS |
| ------------------------------ | ---------------- |
| 容器经一层 nginx/Caddy 反代    | `1`（默认）      |
| 反代链多层（CDN + LB + nginx） | 按实际跳数       |
| 直接暴露、无反代               | `0`              |

反代需透传 `X-Forwarded-For` / `X-Forwarded-Proto` 并终止 TLS。示例（Caddy 同源拓扑）：

```caddy
app.example.com {
  encode gzip
  reverse_proxy /api/* fairy-api:3000
  reverse_proxy fairy-web:80
}
```

## 6. 环境变量总表

`.env.example` 是同一张表的本地副本，二者必须保持一致（AGENTS §12）。

| 变量                 | 必填                      | 默认值                   | 说明                                        |
| -------------------- | ------------------------- | ------------------------ | ------------------------------------------- |
| `PORT`               | 否                        | `3000`                   | 镜像内已设置                                |
| `TRUST_PROXY_HOPS`   | 否                        | `1`                      | 反代跳数，见 §5                             |
| `TZ`                 | 否（**强烈建议**）        | 容器内已 `Asia/Shanghai` | 见下方 §6.1 时区说明                        |
| `DATABASE_URL`       | **是**                    | —                        | Postgres 连接串；托管库用 pooled + 超时参数 |
| `JWT_SECRET`         | **是**                    | —                        | 启动强校验；`openssl rand -base64 48` 生成  |
| `AI_PROVIDER`        | 否                        | `deepseek`               | `deepseek` / `openai` / `claude`            |
| `AI_MODEL`           | 否                        | 供应商默认               | 覆盖默认模型                                |
| `AI_TIMEOUT_MS`      | 否                        | `60000`                  | 单次 AI 请求超时；reasoning 模型实测 raw 11-25s，低于此值会被 abort 成误导性的 `PARSE` |
| `DEEPSEEK_API_KEY`   | `AI_PROVIDER=deepseek` 时 | —                        |                                             |
| `DEEPSEEK_BASE_URL`  | 否                        | 供应商默认               | 自建网关/代理时覆盖                         |
| `OPENAI_API_KEY`     | `AI_PROVIDER=openai` 时   | —                        | embedding 未单配时也回落读它                |
| `OPENAI_BASE_URL`    | 否                        | 供应商默认               |                                             |
| `ANTHROPIC_API_KEY`  | `AI_PROVIDER=claude` 时   | —                        |                                             |
| `ANTHROPIC_BASE_URL` | 否                        | 供应商默认               |                                             |
| `EMBEDDING_API_KEY`  | 否                        | 回落 `OPENAI_API_KEY`    | 记忆向量召回；不配则检索走结构化路径        |
| `EMBEDDING_MODEL`    | 否                        | 内置默认                 |                                             |
| `EMBEDDING_BASE_URL` | 否                        | 回落 `OPENAI_BASE_URL`   |                                             |
| `AMAP_SERVER_KEY`    | 否                        | —                        | 行程规划；缺失/超时降级返回说明，不抛错     |
| `VITE_API_URL`       | 仅 web 镜像 build arg     | 空（同源）               | 见 §1                                       |
| `VITE_AMAP_JS_KEY`   | 仅 web 镜像 build arg     | 空（地图不渲染）         | 行程地图浏览器端密钥（防盗链），见 §1       |

### 6.1 时区：运营建议调度与洞察窗口的共同依赖

运营建议（`/api/suggestions`）的每日 08:00 日报、近 7 天零借阅判定、以及运营洞察的趋势/活跃窗口，**全部按服务器本地日期分桶**：

- api 镜像已内置 `ENV TZ=Asia/Shanghai`（且安装 `tzdata`——`TZ` 只是环境变量，缺 zoneinfo 文件时 `Date` 仍按 UTC 走）。自研部署/裸机运行时必须显式设置 `TZ=Asia/Shanghai`，否则日报的「本地日」整体前移 8 小时（UTC 下 08:00 变成本地凌晨，日报在门店无感时段生成），洞察窗口首日 00:00–08:00 数据静默缺失。
- `process.env.TZ` 缺失时，API 启动只 `warn` 一次（`TZ_NOT_SET`），不阻断服务。
- 发布后验证：`docker exec fairy-api date` 应显示 CST（+0800）。

### 6.2 多实例部署下的建议调度

调度是**进程内** `setInterval`（无外部 cron/queue）：每个 API 副本都会跑阈值周期（15 分钟）与 08:00 日报判定，启动即跑一次。重复执行不会产生重复建议——`ops_suggestions.dedupeKey` 唯一索引是去重唯一事实来源，后到的一方按 P2002 冲突跳过；同一本地日的日报最多一条。**漏触发可接受（下个周期/次日补上），重复建议不可接受（由唯一索引保证）**。SIGTERM 时调度先于 http server 停止，不会在容器关闭途中再起一轮生成。横向扩到多副本没有额外配置，代价只是每个副本各跑一次轻量聚合查询。

## 7. 运维红线

- **禁止在生产执行 seed**：`packages/database/prisma/seed.ts` 检测到
  `NODE_ENV=production` 会直接退出（demo 账号口令是公开的，见该文件顶部注释与
  PROJECT_STATUS 风险表）。真实账号走注册流程。
- 演示账号 `user@fairy.local` / `admin@fairy.local` 仅为本地 demo 存在，任何环境都不要
  沿用其口令。
- 日志不得出现密钥与完整响应体（AGENTS §14）；反代之后的 `trust proxy` 配置错误会让
  限流失效，改反代拓扑时同步核对 `TRUST_PROXY_HOPS`。
- 升级顺序：`migrate:deploy` → 滚动替换 api 容器 → 按需替换 web 容器（web 是静态产物，
  无状态，可直接替换）。

## 8. 发布后验证清单

1. `curl https://api.example.com/health` 返回 200。
2. 注册/登录一次，确认 `{ code, data, msg }` 封装与 401 行为（API_CONTRACT §3）。
3. 发送一条对话，确认流式返回（SSE）与降级文案（docs/prompts.md 的回复约束）。
4. 检查容器时区：`docker exec fairy-api date` 应显示 CST（+0800），验证 `TZ` 生效。
5. 连续请求确认限流按 IP 生效（同 IP 超限返回 429，不同 IP 互不影响）。
6. 规划一条行程（对话或 `/trips` 页），确认行程卡片底部地图区块可见：有 POI Marker、
   有坐标的相邻 POI 间有路线折线；若部署域名未加进高德 referrer 白名单，地图会静默
   不显示而文字行程正常——此时按控制台提示补白名单即可（密钥配置见 §1）。
7. 运营建议调度冒烟：API 日志应出现 `{"source":"suggestionScheduler","event":"threshold_cycle",...}`
   （启动即一次）；admin 打开运营看板可见「运营建议」卡片（空态也渲染）；点「立即生成日报」
   当日再点不新增第二条。

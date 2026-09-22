# 2026-09-21 会话工作日志：工程验证门禁 + 8 个 P1 正确性修复（15 提交）

## 本轮完成

1. **工程门禁（批次 1，Commit 1–3）**：补齐 ESLint/Prettier 配置（eslint 8.57 + 最小规则集，不开 no-console——服务端日志是既有约定；printWidth 100 与现状一致，`pnpm format` 仅重排 44 行），删除 4 个被误提交的 `seed.{js,d.ts,js.map,d.ts.map}` tsc 产物与 5 处死代码（`routes/trips.ts`、两个 0 字节 controller、`AdminDashboard.tsx`、`useSSE.ts`），修 `.gitignore`（删 migration_lock.toml 自相矛盾的 ignore 行），让根 `pnpm lint` / `format:check` / `test` 三条命令从必败变全绿（database 包改 `--passWithNoTests`、补 `migrate:dev` 别名、turbo dev 加 `dependsOn: ["^build"]`）。
2. **CI（批次 2，Commit 4）**：`.github/workflows/ci.yml` push/PR 触发，Node 20 + pnpm 9，lint → typecheck → test，测试全 mock、无需 DB 与密钥——AGENTS §10「不允许合并带失败检查的 PR」至此有着落。
3. **P1 正确性修复（批次 3，Commit 5–12，每个独立提交，均按「先失败测试再修」）**：
   - **① trust proxy**：`app.set("trust proxy")` 读 `TRUST_PROXY_HOPS`（默认 1）。反代后 login/register/chat 三个限流器此前的退化是全站共享单桶（chat 每分钟全网仅 30 请求）；补 `app.test.ts` 断言生效值，`.env.example` 登记并删除已移除的 dev auth stub 残留说明。
   - **② 趋势首日丢数据**：`insightService` 的 `localMidnight` 之前取「本地日期的 UTC 午夜」，CST 下 00:00–08:00 静默丢失；改为本地构造 `new Date(y, m, d)` 并导出单测。契约同步「部署须显式 TZ=Asia/Shanghai」。
   - **③ 回填脚本死循环**：`embedding IS NULL` 的选取条件对「跳过/失败」行永远选得到同一批，脚本空转。纯函数 `selectFreshRows(pending, attemptedIds)` 拆到 `scripts/backfillProgress.ts` 单测；主循环累积 attempted 集合、无新鲜行 break 并 warn、有失败行退出码 1。
   - **④ 看板成本线性增长**：RECOMMEND 统计加 30 天窗口（全时累计→近 30 天，契约与决策行同步）；`behavior_logs`/`rentals` 无保留策略登记为残余风险。
   - **⑤ 日志写拖垮成功路径**：`behaviorLogService` 增 `appendQuietly`（try/catch + warn），借（2 处）/还/推荐/规划行程四个工具的成功路径改用它——此前 insert 失败会把已成功的操作报成 500/「Fairy 出了点状况」，而契约错误表里没有 500 这档。
   - **⑥ 空白流用户只收到空白**：`chat.ts` 的 `streamed` 仅当 `delta.trim()` 非空才置位，流只吐空白 chunk 时兜底完整答案被跳过；改为空白 chunk 也写 SSE 但不置位。补 `llmClient.test.ts` 四例（正常流/零 chunk/纯空白/中途失败）+ 空白流 SSE 用例。
   - **⑦ 非 UUID sessionId 变 500**：`chatSchemas.sessionId` 加 `.uuid()`、`message` 加 `.max(2000)`（对齐 `llmClient.MAX_INPUT_CHARS`），契约 §3.7 同步注记。
   - **⑧ 编辑记忆后向量不一致**：`updateMemory` 在 content 变更后补 `refreshEmbeddingQuietly`（create 路径本来就有、update 路径漏了）。
4. **脊柱文档同步（Commit 13 + 15）**：API_CONTRACT（§3.0 限流与 trust proxy、§3.7 请求体注记、§3.13 时区与统计口径）、ARCHITECTURE（§3.0/§8 决策行、§9 映射、§10 CI 与本地验证）、PROJECT_STATUS（Completed 新条目、Next Steps 路线图登记、Last Updated）。
5. **验证（批次 4）**：完整 `pnpm run ci`（lint + typecheck + test + build）退出码 0——api 326、web 79、shared 99、ai-sdk 16、database 4 全绿；build 后工作树干净（见踩坑 ④）。双 dev server 冒烟 6 项全过：api `/health` OK；web 首页 200；无 token 请求 401（统一 `{code,data,msg}` 信封）；非 UUID sessionId 400（修复 ⑦ 实测）；超 2000 字符 message 400（修复 ⑦ 实测）；LLM 链路完整 SSE 增量 + done + sessionId 落库 + usage 日志；**降级链路**用无效 key 起 api 实测——回复逐字命中 `templateForNone` 模板、正常 done、日志里 **0 条** LLM 用量、无挂起无 500（修复 ⑥ 的回退路径实测）。
6. **顺带发现的工程缺陷（Commit 14–15）**：web 的 `build` 用裸 `tsc` 会向 `src/` 旁吐 168 个 `.js/.d.ts/.map` 产物，vitest 把编译出的 `.test.js` 也当测试文件——文件数 24 对 12、用例 158 对 79 翻倍。改为 `tsc --noEmit && vite build`（产出物全部来自 vite 的 `dist/`），清掉产物后复测 12/79；ARCHITECTURE §10 补了识别特征说明。

## 踩坑记录

- **turbo 2 严格 env 模式吞未声明变量**：`DEEPSEEK_API_KEY=x pnpm dev` 到不了 api 进程（turbo.json 没声明的 env 会被过滤），api 回落读 `.env`，日志证明每次都在真调 deepseek。想让冒烟强制走降级链路，须绕过 turbo 直接 `pnpm --filter=@fairy/api dev`（pnpm 会把父进程 env 透传下去，用 `sk-chain-test` 链路实测验证过透传本身没问题）。
- **TaskStop 杀不干净孙子进程**：停 turbo wrapper 后 tsx/vite 仍在，第二次 `pnpm dev` 直接 EADDRINUSE :::3000、vite 偷偷让到 5174。按 `netstat -ano` 找到 LISTENING PID 逐个 `taskkill //F //PID`（多 PID 一次传会报「无效参数」，必须循环）。
- **Bash 工具 → curl 的中文 UTF-8 串损**：`curl -d` 带中文 payload 到达 API 是乱码（LLM 礼貌回复「消息好像有点乱码」）。冒烟请求改用 `node -e` + fetch，UTF-8 才正确。
- **`pnpm ci` 是保留命令**：pnpm 9 未实现 built-in `ci`，直接跑报 `ERR_PNPM_CI_NOT_IMPLEMENTED`；仓库脚本要写 `pnpm run ci`。
- **空环境变量等于没有**：`DEEPSEEK_API_KEY= ...`（值为空）与 `''` 都走 dotenv 回退到配置文件，想「清空 key 逼降级」必须给一个非空假 key（如 `sk-invalid-smoke-key`）。
- **journal 的 add_session.py 从仓库根跑会 import 失败**：须 cd 到 `.trellis/scripts/` 再执行（内部 `from common import ...`）。
- **git add 报 pathspec 不匹配**：Bash cwd 跨调用会漂移，git 命令前先确认在仓库根 `E:\Fairy-help`（monorepo 的 pnpm 命令则相反，必须 `cd Fairy`）。

## 未完成 / 后续

- **`createSession` 失败未按契约优雅降级**（下一批候选，非本轮范围）：JWT 里 userId 不存在（FK P2003）或库瞬断（如 Neon 冷启动）时，`routes/chat.ts:54` 把异常抛成 500 `INTERNAL_ERROR`，而契约已写明 `done.sessionId = null` 表示「未建会话」——按「会话落库为旁路」的架构决策，这里应该 fail-quietly。本轮用伪造 userId 冒烟时复现过一次，确认为烟雾装置假象（真实 token 必带已存在用户），但库瞬断路径是本该修的。
- **15 个提交未推送**：均在本地分支 `chore/reliability-fixes`（基于 master `c71c135`），推送需明确指示。
- **后续路线图已登记进 PROJECT_STATUS.md Next Steps**，每批执行前逐个再确认：
  - 批次 5（安全）：对话历史消毒 + 不可信跨度分隔符、refresh token 多标签同步（BroadcastChannel）+ SSE 401 单飞刷新、refresh 旋转 TOCTOU 改事务内 `updateMany`。
  - 批次 6（产品）：行程门禁身份化（`User.role` 是 String 列、无需迁移，改画像名不再失效）、意图规则语境修正、错误信息归一化为 i18n code。
  - 批次 7（落地件）：Dockerfile（TZ=Asia/Shanghai）+ 部署清单、seed 加 `NODE_ENV=production` 防护、真实库并发集成测试（默认跳过）、`docs/prompts.md`、README 补全。

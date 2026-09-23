# 2026-09-23 主动运营建议交付与归档会话记录

分支 `feature/travel-planning-phase-2`（基于 `chore/reliability-fixes`），**已推送 origin**（cbd2f60..6aa39e7，负责人「继续」指示后执行）。本会话 2 个代码提交：`4fc6ad1`（feat db+shared+api）、`11ceef1`（feat web），随后 1 个文档提交（docs spine + openspec archive + 本文档）。本特性早前提交：`85700c1`（需求登记）、`6caccfd`（OpenSpec 提案）、`cbd2f60`（提案轮 journal）。OpenSpec 轨完整闭环：grill-me 收敛 → 需求 approved → 提案 approved → Apply → 真机验收 AC-1~7 → Archive。

## 流程与门禁

- 需求文档 `docs/requirements/2026-09-23-proactive-ops-suggestions.md` grill-me 收敛，四项决策点均按推荐默认获批（阈值+每日日报触发 / LLM 生成+失败降级 / 运营洞察页内建议流 / 不做对话联动）→ 负责人「继续」→ OpenSpec 提案 `2026-09-23-proactive-ops-suggestions`（proposal/design/tasks + specs delta `ops-suggestions`）→ 负责人「批准」→ Apply。
- 属 §15.1 大变更（跨 db+shared+api+web 四包 + 公共 API 契约 + ARCHITECTURE 决策行），未使用 P0/P1 豁免；提案阶段定稿的 5 项待决问题全部按定稿落地：① 调度 = 进程内 `setInterval`（零新依赖，单实例假设写入 deployment.md，多实例以 `dedupeKey` 唯一索引兜底防重）；② 阈值 = 低库存 `stock<=1`（与看板同口径）+ `borrowedRatio >= 0.8` + 近 7 天借阅和为 0；③ `body` 纯文本（前端 `whitespace-pre-line`，不引 Markdown 库）；④ 不加阈值检测手动端点，AC-1 靠单测直推 service + 真机等检测周期；⑤ 未读态覆盖全部四类建议。

## 实现要点（相对提案的落地细节）

### db（4fc6ad1）

- `schema.prisma` 新增 `SuggestionKind` 枚举（`LOW_STOCK`/`BORROW_RATIO`/`DORMANT`/`DAILY_REPORT`）与 `OpsSuggestion` 模型（`id/kind/dedupeKey/summary/body/sourceData Json/readAt DateTime?/createdAt`；`@@unique([dedupeKey])` 注释说明「恢复前同类异常唯一、并发兜底」；`@@index([createdAt])` 供列表时间倒序；`@@map("ops_suggestions")`）。描述性迁移 `20260923103000_add_ops_suggestion`，dev 库已应用、`migrate:status` 一致。
- **去重唯一事实来源是唯一索引本身**：create 命中 P2002 即视为已存在跳过，不依赖先查后写（并发下两个实例同时检出同一异常也只有一条落库）。

### shared（4fc6ad1）

- `suggestionSchemas.ts`：`suggestionSchema`（kind/summary/body/**sourceData**/readAt nullable/createdAt）、`suggestionListFeedSchema`（items + pagination {page,limit,total,totalPages}）、`unreadCountSchema`、分页查询 schema（page≥1、limit 1–100）+ 类型导出。提案阶段的待决点「sourceData 是否下发」定为**下发**：AC-4 需要核对降级正文与真实数据一致，运营侧审计同样需要。
- 测试：item 形状校验（未知键剥除）、feed 信封、unread count、查询边界。

### api（4fc6ad1）

- `services/suggestionService.ts`：
  - `detectThresholdAnomalies(now?)` 读 `getStoreInsightsOverview(now)`——**单一事实来源**，低库存取 `inventory.lowStockMovies` 每部一条 `LOW_STOCK:<movieId>`、借出率 `BORROW_RATIO:store`、近 7 天趋势借阅和为 0 `DORMANT:store`；产出草稿自带模板摘要备用。
  - `generateSuggestion(draft)` 走统一 AI SDK `tryChat("agent.suggestion", ...)`（`maxTokens: SUGGESTION_MAX_TOKENS=3000`、`temperature: 0.4`），prompt 只用聚合 JSON + Fairy 口吻/只用给定数据/≤300 字；返回 null（无 key 或 provider 错误）→ 回落草稿模板摘要并标 `degraded`——任何路径不 500、不泄 provider 负载（§0 降级哲学）。
  - `runThresholdCycle(now?)`：检测 → 逐条生成并 create（P2002 skip）→ **恢复清理** `deleteMany`（LOW_STOCK 键不在活跃集合内即删；BORROW_RATIO/DORMANT 阈值回落删对应键）→ 返回 `{created, skipped, closed}`。语义：补货后重新缺货必须再次提醒（新行、新未读），只是报警不学会安静。
  - `generateDailyReport(now?)`：`DAILY_REPORT:<本地日键>`，已存在直接返回既有（当日幂等）；`listSuggestions`（createdAt desc + skip/take + count）、`getUnreadCount`、`markRead`（幂等，未知 id → null → controller 404）。
- `services/suggestionScheduler.ts`：纯函数 `shouldRunThresholdCycle(now, lastCycleAt)` / `shouldRunDaily(now, lastDailyDateKey)`（本地 08:00 口径，复用 `localMidnight`/`toLocalDateKey`）+ `startScheduler`/`stop`：1 分钟 tick、15 分钟阈值周期、启动即跑一次、`process.env.TZ` 缺失 warn 一次不阻断、每 tick try/catch 单轮失败不影响后续。
- `routes/suggestions.ts` + 薄 controller：4 端点（`GET /`、`GET /unread-count`、`PATCH /:id/read`、`POST /generate-daily`）全部 `requireRole("admin")`；generate-daily 新建与复用同一 200 信封（AC-3 断言不产生第二条）；`app.ts` 挂 `/api/suggestions`；**调度只挂 `index.ts`**，SIGTERM/SIGINT 链上先 `stop()` 再 `server.close()`——测试经 `createApp()` 不起调度。
- 测试：`__tests__/suggestions.test.ts`（19 例：三类阈值命中/未命中、P2002 跳过、恢复清理三条路径、日报当日幂等、markRead 幂等与未知 null）、`suggestionScheduler.test.ts`（纯函数分支）、`suggestions.route.test.ts`（401 ×4、user 403 ×4、admin 信封与倒序、未知 read 404、generate-daily 幂等）。

### web（11ceef1）

- `lib/suggestionApi.ts`：list/unread-count/markRead/generateDaily 复用 `lib/http`；错误码进 `lib/errorMessages.ts`。
- `components/admin/SuggestionFeed.tsx`：时间倒序 + 未读高亮 + 单条已读 + 全部已读（对当页未读串行 PATCH）+ 立即生成日报 + 加载/错误/空三态 + kind 中文标签。内联进 `InsightsAdminPage` 卡片槽位（**overview 为空也渲染**——建议流是独立数据，不跟着看板空态一起消失）。`zh-CN.json` 17 键全量文案。
- 测试：suggestionApi 信封/403、SuggestionFeed 三态/未读/已读/立即生成（mock api 层）、InsightsAdminPage 既有用例保持绿 + 建议流集成断言。

### 部署

- `docs/deployment.md`：§6 环境变量总表补 `TZ` 行；§6.1 时区共同依赖（日报 08:00 与洞察窗口同根按本地日分桶，容器内必须 `TZ=Asia/Shanghai` + tzdata）；§6.2 多实例语义（唯一索引兜底：漏触发可接受、重复不可接受）；§8 发布后验证项补建议流。

## 真机验收（AC-1~AC-7 全过，双 dev server api:3000 + web:5173，2026-09-23 19:33–19:40 CST）

- AC-1：《海蒂》stock 5→1 → 重启 api（启动即检测）→ `created=1`，未读 3→4，sourceData 含 movieId/title/stock。
- AC-2：持续 stock=1 重启 `created=0 skipped=3`（去重生效）；回补 5 后下一周期 `closed=1`（存量键清理）；再跌破 `created=1` 且为**新行**（新 createdAt、重新未读）。
- AC-3：两次 `POST /generate-daily` 均 200 且返回同一条、总数不变。
- AC-4：空 key 实例（port 3100）启动周期 `created=3` 且**零 LLM 调用**、正文逐字为模板摘要、无 500；恢复 key 后正文为自然语言且数字与 sourceData 一致（《星际穿越》推荐 5/借出 2、《海蒂》1/3、借出比 0.03125、治愈 3 次、失眠夜 3 次）。
- AC-5：契约矩阵——四端点无 token 401；user 角色四端点全 403 `FORBIDDEN`（`data:null`）；read 二次调用 readAt 不变且未读只减一次；未知 id 404 `SUGGESTION_NOT_FOUND`；`page=0`/`limit=101` 400 `VALIDATION_ERROR`。
- AC-6：单测覆盖清单核对（三个测试文件分支对应上述矩阵）。
- AC-7：全表扫描 4 行无邮箱样式串；sourceData 仅聚合指标 + 影片标识。
- 浏览器 E2E：admin 登录 → `/admin/insights` →「运营建议」卡片渲染 4 条 + 「4 条未读」徽标；「全部已读」后徽标与按钮消失、`/unread-count` 归零（服务端同步确认）。

## 验收期踩坑（1 个实现缺陷已修 + 测试方法）

1. **实现缺陷（已修，本会话最重要发现）**：默认供应商 `deepseek-v4-flash` 是 **reasoning 模型——思考与答案共用同一个 completion 预算**。初版 `maxTokens` 800（验收时甚至加到 2000，日报 prompt 更大）都会被思考吃光：`finish_reason:"length"`、content 为空或半句话，`tryChat` 静默返回 null → 落库退化成模板摘要。**表现是「有 key 也永远走模板」的静默错误**，无任何报错。直连 provider 打点确认 reasoning_tokens 后，调整为 `SUGGESTION_MAX_TOKENS = 3000`，实测稳定完整收尾。属实现细节非契约变更，已记入 ARCHITECTURE §8 决策行与 tasks.md 3.2；换非 reasoning 供应商只会更宽松。
2. **临时探针脚本两个坑**（测试方法）：`@prisma/client` 解析跟随脚本位置，需绝对路径 `packages/database/node_modules/@prisma/client`；租赁状态枚举默认值是 `ACTIVE` 不是 `BORROWED`。
3. **Git Bash `/tmp` ≠ node `/tmp`**：`node -e` 读 `/tmp/x.json` 报 ENOENT，须 `cygpath -w` 转换后作 argv 传入。
4. **IAB locator click 超时**：本环境 Playwright 点击类动作会 stall（textbox 填充可用），登录/已读统一走页面内 `evaluate` DOM click / `form.requestSubmit()` 兜底，效果以页面 + 服务端双向确认。
5. **降级实例的隔离手法**：`DEEPSEEK_API_KEY= PORT=3100` 起第二实例——dotenv 不覆盖进程已有的空 env、`AI_PROVIDER` 未配置 → `getLlmProvider()` 返回 null → 模板路径；`JWT_SECRET` 同源（同一 .env）所以 3000 的 admin token 在 3100 直接可用。
6. **重启 dev server 的正确顺序**：TaskStop 后台任务后 tsx 子进程仍占端口，必须 `netstat -ano | grep LISTENING` → `taskkill //PID` → 确认端口释放再启动，否则 EADDRINUSE。

## 验证

shared 116 / api 400（真实库并发用例门控跳过 ×1）/ web 135 全绿 + shared/api/web/database 四包 typecheck + `pnpm lint` 8/8 + prettier `format:check` + web/database build + `openspec validate --all --strict` 13/13。`pnpm ci` 在本机报 `ERR_PNPM_CI_NOT_IMPLEMENTED`（沿用惯例：按 package.json 定义链 lint→typecheck→test→build 手工等价执行）。`openspec archive 2026-09-23-proactive-ops-suggestions --yes` 完成，specs/ops-suggestions 合并 +7，change 移入 `openspec/changes/archive/`。

## 收尾

- 文档脊柱：`API_CONTRACT.md` §3.16（4 端点 + JSON 示例 + 错误码表）+ §4 补 `SUGGESTION_NOT_FOUND`；`ARCHITECTURE.md` §8 决策行（进程内调度+单实例假设+唯一索引兜底 / LLM 降级 / 恢复即清理 / reasoning 预算）×3 + §9 模块映射；`docs/deployment.md` 三节；`PROJECT_STATUS.md` 五节（Completed Modules 顶部 + Next Steps 置已交付 + Last Updated 交付条）；需求文档与 README 索引置 **implemented**；tasks.md 7 组全 `[x]`（6.4/7.2/7.3 收尾条含验收记录与归档结果）。
- 清理：临时探针 `Fairy/scripts/accept-probe.cjs` 已删除；dev 库《海蒂》stock 恢复 seeds 基线 1、4 条建议全部已读。工作树中唯一未跟踪文件 `专区黄S级角色配色.xlsx` 与本特性无关，**未纳入提交**。
- 安全：三份 `.env` 均被 `.gitignore` 命中、0 跟踪；提交 diff 0 处疑似密钥（存在性只以「已配置/未配置」表述，不回显值）。
- **已推送**：负责人「继续」指示后推送 origin（`cbd2f60..6aa39e7`，直接 push 无需 API 绕行）。推送前对 push 范围做隐私/密钥扫描：密钥样式（sk-/ghp_/AIza/sk-ant-/私钥头/postgres 连接串）0 命中、`git ls-files` 0 个真实 `.env`、无 >500KB 文件、diff 新增行 0 个邮箱样式串。分支领先 master 53 提交（reliability 整改 + FU-19 + 本特性），合并走 PR；origin/master 尚未包含这些提交。

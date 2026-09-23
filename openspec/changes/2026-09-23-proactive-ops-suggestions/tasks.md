# Tasks: 2026-09-23-proactive-ops-suggestions

## 1. db：OpsSuggestion 模型与迁移

- [ ] 1.1 `packages/database/prisma/schema.prisma` 新增 `SuggestionKind` 枚举（`LOW_STOCK`/`BORROW_RATIO`/`DORMANT`/`DAILY_REPORT`）与 `OpsSuggestion` 模型（`id/kind/dedupeKey/summary/body/sourceData Json/readAt DateTime?/createdAt`；`@@unique([dedupeKey])` 带注释说明「恢复前同类异常唯一、并发兜底」、`@@index([createdAt])` 说明「列表时间倒序」、`@@map("ops_suggestions")`）；`pnpm --filter=@fairy/database generate`
- [ ] 1.2 生成描述性迁移 `add_ops_suggestion`（migrate:dev）；`migrate:status` 确认 schema 与迁移一致

## 2. shared：建议 schema

- [ ] 2.1 `suggestionSchemas.ts`：`suggestionSchema`（kind 枚举/summary/body/readAt nullable/createdAt——**不含** sourceData 进响应？定为含：审计与降级核对需要，AC-4 断言数据一致；按需求文档 data 形状含 `sourceData`）、`suggestionListFeedSchema`（items + pagination {page,limit,total,totalPages}）、`unreadCountSchema`（{count}）+ 类型导出；`schemas/index.ts` 导出
- [ ] 2.2 shared 测试：item 形状校验（未知键剥除）、feed 信封、unread count；`pnpm --filter=@fairy/shared typecheck` + test

## 3. api service：阈值检测 / 日报 / 生成降级 / 去重 / 查询

- [ ] 3.1 `services/suggestionService.ts`：导出常量（`BORROW_RATIO_THRESHOLD=0.8`、`DORMANT_DAYS=7`、`DETECTION_INTERVAL_MINUTES=15`、`DAILY_HOUR=8`）；`detectThresholdAnomalies(now?)`——读 `getStoreInsightsOverview(now)`，产出 `{ kind, dedupeKey, summary, body, sourceData }[]`（低库存取 `inventory.lowStockMovies` 每部一条 key `LOW_STOCK:<movieId>`；借出率 `borrowedRatio >= 0.8` key `BORROW_RATIO:store`；近 7 天 trend 借阅和为 0 key `DORMANT:store`）
- [ ] 3.2 `generateSuggestion(draft)`：`tryChat("agent.suggestion", ...)`（maxTokens 800 / temperature 0.4，prompt 只用聚合 JSON + Fairy 口吻/只用给定数据/≤300 字/2–4 要点）→ null 走 `renderTemplateSuggestion(kind, snapshot)`；返回 `{ summary, body, degraded: boolean }`
- [ ] 3.3 `runThresholdCycle(now?)`：检测 → 逐条生成并 `create`（`dedupeKey` 唯一索引，P2002 catch 视为已存在跳过）→ 恢复清理 `deleteMany`（LOW_STOCK key 不在活跃集合内；BORROW_RATIO/DORMANT 阈值回落时删对应 key）；返回 `{ created, skipped, closed }` 供日志/测试
- [ ] 3.4 `generateDailyReport(now?)`：`dedupeKey = DAILY_REPORT:<toLocalDateKey(now)>`；已存在直接返回既有（幂等）；否则走 3.2 生成 + create（P2002 → 读回当日既有）
- [ ] 3.5 查询面：`listSuggestions({ page, limit })`（createdAt desc + skip/take + count，信封同既有惯例）、`getUnreadCount()`、`markRead(id)`（幂等，未知 id 返回 null → controller 404 `SUGGESTION_NOT_FOUND`）
- [ ] 3.6 `services/suggestionScheduler.ts`：纯函数 `shouldRunThresholdCycle(now, lastCycleAt)` / `shouldRunDaily(now, lastDailyDateKey)`（本地 08:00 口径，复用 `localMidnight`/`toLocalDateKey`）+ `startScheduler({ cycleMinutes? })`（setInterval，启动即跑一次，每 tick try/catch，返回 stop 句柄；`process.env.TZ` 缺失 warn 一次）
- [ ] 3.7 api 测试（`__tests__/suggestions.test.ts` 镜像结构）：三类阈值各命中/未命中；去重（同 key 再触发 skip、P2002 catch）；恢复清理（库存回补键消失、BORROW_RATIO 回落、DORMANT 恢复）；日报当日幂等（生成两次一条）；markRead 幂等 + 未知 null；mock DB（既有测试批次手法）与 `tryChat`（mock llmClient 或 provider）

## 4. api 路由与挂载

- [ ] 4.1 `routes/suggestions.ts` + `controllers/suggestionController.ts`：`GET /`（分页查询校验）、`GET /unread-count`、`PATCH /:id/read`（404 `SUGGESTION_NOT_FOUND`）、`POST /generate-daily`（201 + 当日既有则 200 幂等返回？定：两种路径都返回 200 + data，create 与复用同一信封；AC-3 真机断言不产生第二条）；全部 `requireRole("admin")`；`app.ts` 挂载 `/api/suggestions`
- [ ] 4.2 api 路由测试：无 token 401；user 角色四端点全 403 `FORBIDDEN`；admin 列表信封形状 + 倒序；未知 id read 404；generate-daily 幂等；controller 保持薄（业务在 service）
- [ ] 4.3 `apps/api/src/index.ts` 挂 `startScheduler()`，SIGTERM 优雅关闭链上 `stop()`（与既有 server close 时序一致）

## 5. web：建议流

- [ ] 5.1 `lib/suggestionApi.ts`：listSuggestions / getUnreadCount / markSuggestionRead / generateDailySuggestion（复用 `lib/http`，错误码进 `lib/errorMessages`）
- [ ] 5.2 `components/admin/SuggestionFeed.tsx`：时间倒序列表 + 未读高亮 + 单条已读 + 全部已读（对当页未读串行 PATCH）+ 「立即生成」按钮 + 加载/错误/空态三态；kind → 中文标签映射
- [ ] 5.3 `InsightsAdminPage` 集成：建议流卡片槽位 + 未读徽标；既有 overview 看板行为不变
- [ ] 5.4 web 测试：suggestionApi 信封/403；SuggestionFeed 三态/未读数/标记已读/立即生成（mock api 层）；InsightsAdminPage 既有用例保持绿 + 建议流集成断言；`locales/zh-CN.json` 全量文案

## 6. 文档脊柱

- [ ] 6.1 `API_CONTRACT.md`：新增 suggestions 端点节（4 端点 + 错误码表 401/403 `FORBIDDEN`/404 `SUGGESTION_NOT_FOUND`）
- [ ] 6.2 `ARCHITECTURE.md`：§8 决策行（进程内调度 + 单实例假设 + 唯一索引兜底；LLM 失败降级模板摘要；恢复即清理的去重语义）+ §9 模块映射（suggestionService/suggestionScheduler/SuggestionFeed/ops_suggestions）
- [ ] 6.3 `docs/deployment.md`：调度单实例假设与多实例语义、`TZ=Asia/Shanghai` 依赖（与洞察窗口同根，交叉引用）
- [ ] 6.4 完成后：`PROJECT_STATUS.md` 移入 Completed Modules；需求文档/README 置 implemented；`openspec archive 2026-09-23-proactive-ops-suggestions --yes`；Trellis journal 收尾

## 7. 验证与验收

- [ ] 7.1 三包 typecheck + shared/api/web 测试全绿 + `pnpm lint` + prettier `format:check` + build（或 `pnpm run ci` 定义链）；`openspec validate --all`
- [ ] 7.2 真机验收（双 dev server，admin 账号）：AC-1 改 dev 库某影片 stock≤1 → 重启 api（启动即检测）→ 建议流出现 LOW_STOCK、未读 +1、sourceData 含该片；AC-2 保持 stock≤1 重启/等周期不新增，回补后再跌破出新条；AC-3 立即生成 201、当日重复点击不新增；AC-4 切断 LLM（临时清 key 重启）仍落库且正文为模板摘要、无 500；恢复 key 后生成正文为自然语言且数字与 sourceData 一致；AC-5 契约矩阵（401/403/信封/read 幂等/404）；AC-6 单测覆盖清单核对；AC-7 响应与建议无用户隐私字段（DB 断言列值无邮箱）
- [ ] 7.3 验收后清理：临时探针脚本删除、`git status` 干净、diff 无密钥

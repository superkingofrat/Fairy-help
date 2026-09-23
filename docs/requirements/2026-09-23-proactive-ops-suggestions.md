# 需求：Fairy 主动生成运营建议（主动式运营洞察）

> 状态：**confirmed（待批准开发）** · 日期：2026-09-23 · 负责人：Flores · grill-me 收敛：四项决策均按推荐默认获批（阈值+日报触发 / LLM 生成+失败降级 / 运营洞察页内建议流 / 不做对话联动）
> 轨道：OpenSpec（大变更：新增 Prisma 模型与迁移、新增公共 API 端点、跨 db+api+shared+web 四包，`ARCHITECTURE.md` 需补决策行）
> 前置：FU-11 Store Insights 运营看板（`GET /api/insights/overview` 只读聚合）、FU-12 storeInsightTool 对话问数均已交付归档；本需求承接初版项目设定「运营仪表盘：统计借阅数据，Fairy 可主动生成运营建议」中一直未落地的「主动」半边。

## 背景 / 问题

1. **初版设定的「主动」一直缺席**：初版项目设定功能模块第 2 节写明「运营仪表盘：统计借阅数据，Fairy 可主动生成运营建议」。已交付的 FU-11/FU-12 只做到**被动**两形态——管理端看板手动刷新（`InsightsAdminPage` 的刷新按钮）、对话里 admin 主动问（`storeInsightTool`）。全链路没有调度、没有推送、没有未读态：低库存这类异常只能等管理员自己想起去刷看板。
2. **聚合能力已经就绪，缺最后一环**：`insightService.getStoreInsightsOverview()` 已产出完整结构化运营事实（热门影片、14 天借还趋势、库存状态含低库存名单、心情/场景分布、活跃度），`@fairy/ai-sdk` 已具备 `chat()` 能力——「真实数据 → 自然语言建议」的管线只差触发、生成、落库、展示四步。
3. **降级哲学必须延续**：`insightService` 与 agent 全链路的既有约定是「无 key/查询失败静默降级不抛错」（§0 用户体验保障）。建议生成同样不得反向拖累主链路：LLM 失败必须降级为模板化数据摘要，不得让看板或对话报错。
4. **归属边界要借本案钉死**：建议是给门店管理者的经营参考（含影片/库存/借阅数据），必须 `role="admin"` 门禁；不入对话、不做站外推送——本期只在管理端可见。

## 目标

1. **阈值触发**：复用 `insightService` 现有口径检测经营异常——低库存（沿用 `LOW_STOCK_THRESHOLD=1` 名单）、借出率 `borrowedRatio` 超阈、近 7 天零借阅（冷清预警）等；触发即生成一条建议并落库。
2. **每日日报**：服务器本地时间每天 08:00（`TZ=Asia/Shanghai` 约定，对齐 `localMidnight` 口径）基于当日 overview 合成一份日报建议，一天一条。
3. **手动立即生成**：管理端提供「立即生成日报」动作（`POST /api/suggestions/generate-daily`，admin）+ 当日幂等——既服务真机验收（不必等 08:00），也服务演示。
4. **LLM 生成 + 失败降级**：真实聚合数据进 prompt，经 `@fairy/ai-sdk` 统一 `chat()` 接口（供应商/模型走 env，不在本功能硬编码）转写成 Fairy 口吻的经营建议；LLM 不可用（无 key/超时/报错）时降级为模板化数据摘要，建议仍正常落库，全程无 500、无未捕获错误。
5. **去重防轰炸**：同类阈值异常在恢复前不重复生成（如同一影片低库存只报一次，库存回补后再跌破才再报）；日报一天一条。
6. **管理端建议流**：`InsightsAdminPage` 内新增建议流卡片——时间倒序、未读高亮、单条/全部标记已读、顶栏未读数；加载/错误/空态齐全，文案全 i18n。

## 范围

- **db（`packages/database`）**：新增 `OpsSuggestion` 模型——`id / kind`（枚举：`LOW_STOCK` / `BORROW_RATIO` / `DORMANT` / `DAILY_REPORT`）/ `dedupeKey`（唯一，恢复前重复触发据此豁免）/ `summary`（一句话标题，模板或 LLM 摘要）/ `body`（Markdown 或纯文本正文，模板摘要或 LLM 生成）/ `sourceData`（`Json`，触发时的真实聚合快照，供审计与降级核对）/ `readAt DateTime?`（未读态）/ `createdAt`；`@@index([createdAt])`、`dedupeKey` 唯一索引（复合/唯一索引按 §4 注释说明意图）。一次描述性迁移（如 `add_ops_suggestion`）。种子数据不加。
- **api**：新增 `services/suggestionService.ts`（阈值检测 / 日报合成 / LLM 生成与降级 / 去重写入 / 查询与已读）；新增 `routes/suggestions.ts` + 薄 controller——`GET /api/suggestions`（admin，时间倒序分页）、`GET /api/suggestions/unread-count`、`PATCH /api/suggestions/:id/read`（幂等）、`POST /api/suggestions/generate-daily`（admin，当日幂等）；`app.ts` 挂载，鉴权沿用 `authMiddleware` + `requireRole("admin")`。调度：进程内定时器（`setInterval`，零新依赖；单实例部署假设写入 `docs/deployment.md`，多实例下以 `dedupeKey` 唯一索引兜底防重）。错误码沿用统一信封 `{code,data,msg}`（401/403/404 `SUGGESTION_NOT_FOUND`）。
- **shared**：`suggestionSchemas.ts`——`suggestionSchema`（列表/详情同形）、`suggestionListFeedSchema`（`items` + `pagination`，对齐 rentals/trips 列表信封习惯）、`unreadCountSchema`）+ 类型导出 + 测试。
- **web**：`lib/suggestionApi.ts`（复用 `lib/http` 与 `lib/errorMessages.ts` 归一化）；`InsightsAdminPage` 建议流卡片（未读数、单条/全部已读、立即生成按钮）；`locales/zh-CN.json` 全量文案。
- **文档**：`API_CONTRACT.md` 新增 suggestions 端点节（4 端点 + 错误码表）；`ARCHITECTURE.md` §8 决策行（进程内调度 + 单实例假设、LLM 降级为模板摘要）与 §9 模块映射；`docs/deployment.md` 补调度单实例说明与 `TZ` 依赖；`PROJECT_STATUS.md`。
- **AI 边界**：prompt 只注入聚合数据与影片标题，不含任何用户隐私字段；`ai-sdk` 之外禁止直连供应商（§5）；LLM 错误日志不得打印响应负载（§5）。

## 非目标

- **对话侧联动**：Fairy 不在 chat 里主动提及未读建议、`storeInsightTool` 不读建议库——grill-me 明确本期不做，另立需求。
- **站外推送**：邮件、WebSocket、浏览器通知一律不做。
- **自动执行动作**：只建议不执行——不自动下架、补货、改库存；执行留给管理员。
- **多实例分布式调度**：单实例 `setInterval` + 唯一索引兜底；要做真分布式调度另立需求。
- **建议的编辑 / 删除 / 反馈闭环**（「有用/没用」按钮）：只做已读态。
- **非 admin 可见**：建议流不进普通用户侧任何页面。
- **历史回填**：只从生效日起产生新建议，不回溯生成历史数据。

## 受影响模块

| 模块 | 改动 |
|---|---|
| `packages/database` | `OpsSuggestion` 模型 + `add_ops_suggestion` 迁移（描述性命名）+ 索引注释 |
| `packages/shared` | `suggestionSchemas.ts` 新增 + 类型 + 测试 |
| `apps/api` | `services/suggestionService.ts`、`routes/suggestions.ts`、controller；进程内调度器（启动时挂载、优雅关闭清理）；`app.ts` 挂载 |
| `apps/web` | `lib/suggestionApi.ts`；`InsightsAdminPage` 建议流（未读/已读/立即生成，三态）；i18n |
| 文档 | `API_CONTRACT.md`（新节 + 错误码表）、`ARCHITECTURE.md`（§8/§9）、`docs/deployment.md`（调度与 TZ）、`PROJECT_STATUS.md` |

## 验收标准（草案）

- **AC-1**：阈值触发（真机，dev 库）——将某影片 `stock` 调至 ≤1 后触发检测（或经手动入口）：生成 `LOW_STOCK` 建议落库，`sourceData` 含该影片快照；管理端建议流可见、未读数 +1。
- **AC-2**：去重（真机 + 单测）——保持 `stock ≤1` 再次触发检测不生成新建议；库存回补后再跌破才生成第二条（`dedupeKey` 唯一索引并发兜底）。
- **AC-3**：每日日报（真机）——「立即生成」按钮/端点返回 201 且建议流出现 `DAILY_REPORT`；当日重复点击不生成第二条（幂等）；坐等本地 08:00 定时触发亦成立（可仅单测覆盖定时逻辑）。
- **AC-4**：LLM 降级（单测 + 真机）——mock/切断 LLM（无 key 路径）时建议照常落库、正文为模板化数据摘要、无 500、无未捕获错误；LLM 可用时正文为自然语言经营建议且数据与 `sourceData` 一致（不出现影片/数字幻觉——prompt 注入即全部事实）。
- **AC-5**：契约与门禁（真机）——`GET /api/suggestions` 信封 `{code:"OK", data:{items,pagination}, msg}`；无 token 401；普通 user 403；`PATCH /:id/read` 幂等（重复调用仍 200、`readAt` 不变）；未知 id 404 `SUGGESTION_NOT_FOUND`。
- **AC-6**：测试——shared schema 三件套；api service（三类阈值、去重、日报幂等、LLM 失败降级、分页/已读）+ 路由（门禁矩阵）；web（建议流三态、未读数、标记已读、立即生成）；全程 mock DB/LLM/时钟，不碰真实库与供应商；三包 typecheck + `pnpm run ci` 全绿。
- **AC-7**：隐私与安全——建议记录与响应不含任何用户隐私字段（只有影片/库存/聚合数字）；数据库无密钥；LLM 错误日志不打印响应负载。

## 待决问题（默认倾向，提案阶段定稿）

1. **调度机制**：默认倾向**进程内 `setInterval`**（零新依赖；单实例假设写入部署文档；多实例靠 `dedupeKey` 唯一索引兜底）。备选：引 `node-cron` 依赖或外部 cron 调 `generate-daily` 端点。
2. **阈值集合与数值**：默认倾向低库存（沿用 `LOW_STOCK_THRESHOLD`）+ `borrowedRatio ≥ 0.8` + 近 7 天零借阅；具体数值与趋势类阈值（如借阅骤降）提案阶段定，宁少勿噪。
3. **`body` 格式**：默认纯文本/Markdown 子集（前端 `whitespace-pre-line` 渲染，不引 Markdown 库）；是否需要富文本提案阶段定。
4. **立即生成入口的形态**：默认 `POST /api/suggestions/generate-daily` + 页面按钮（幂等于当日日报）；是否 also 暴露阈值检测的手动触发端点（验收 AC-1 用）——倾向不加手动端点，AC-1 用改库 + 等待下一个检测周期（检测周期默认 15 分钟）或单测直推 service 层。
5. **未读态范围**：默认仅日报与阈值建议均计入未读；是否只日报计未读（阈值建议进页面即视为看到）——倾向前者，简单一致。

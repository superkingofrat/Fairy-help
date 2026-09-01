## Context

当前门店数据只有 FU-3 的分页明细流水查询（`GET /api/behavior-logs`），没有聚合能力。数据现状：`BehaviorLog`（RECOMMEND 的 `payload.movieIds`、BORROW_SUCCESS/RETURN_SUCCESS 的 `movieId`、`createdAt`）、`Rental`（`createdAt` 借出 / `updatedAt`+`status` 归还）、`Movie`（`stock`/`totalStock`/`moods`/`scenes`）、`User`（`role`/`createdAt`）。可复用的既有模式：admin 守卫 = `requireRole("admin")` + shared schema + `validateQuery`；web 管理页模式 = BehaviorPage（loading/error/empty 三态 + `t()` i18n）+ `request()` 认证客户端。动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- 单个 admin-only 只读端点一次返回看板全部卡片数据，前端一次请求渲染整页。
- 聚合全部基于现有表与既有索引，不加表、不加埋点、不改写入逻辑。
- 看板页零新依赖（纯 CSS 条形图 + 表格），复用 BehaviorPage 的三态与 i18n 模式。

**Non-Goals:**
- 不做 chat 工具（`storeInsightTool` 保持挂账）；不做实时推送/轮询；不做时间范围自定义 UI；不做图表库引入；不做导出。

## Decisions

1. **单端点 `GET /api/insights/overview` 一次返回全部卡片数据**
   数据量小（TOP 5、14 个点、少量低库存），一次请求即可渲染整页，减少往返与前端编排。备选：按卡片拆分多端点——更多 round-trip、更多路由样板，收益低。已批准。

2. **聚合用 Prisma `groupBy`/`count` 多次并行查询，在 service 内组合成 DTO**
   数据量级（几十到几百行/天）下 groupBy 足够；`Promise.all` 并行规避 Neon 冷启动下多查询的串行延迟。备选：原始 SQL `generate_series`/窗口函数——DB 方言耦合、违背「原始查询必须参数化」的简化倾向，且无性能必要。

3. **趋势缺日补 0 在 JS 内存中完成**
   service 按 `createdAt`/`updatedAt` 取最近 14 天记录，JS 端以 `yyyy-mm-dd`（服务器本地日期）建桶并补齐缺失日期。备选：SQL `generate_series`——无需，且把时区逻辑埋进 SQL 更难测。

4. **推荐次数从 `BehaviorLog` RECOMMEND 的 `payload.movieIds` 统计**
   与 FU-3 `recommendCountOf` 的解析先例一致（同一 payload 约定），按片累计推荐出现次数。备选：忽略推荐次数——丢失「推荐热度」这一经营信号，保留。

5. **低库存阈值 `stock ≤ 1` 作为契约常量**
   已批准决策（绝对量、简单可预期）。在 `insightService` 中定义为常量并在 `API_CONTRACT.md` 标注；备选 `stock/totalStock < 20%` 已否决（多副本片永不触发）。

6. **看板页用纯 CSS 条形图，不引图表库**
   数据点少（条形 ≤14、分布 ≤5），CSS `width%` 条形足够；备选 recharts——新依赖、学习成本、对本期收益过大。

7. **日期分桶使用服务器本地日期**
   单门店单时区部署（中国）下按本地日分桶直观；测试用固定 `Date` 断言。多时区部署再参数化（非本期）。

## Risks / Trade-offs

- [Neon 冷启动放大聚合延迟] → 查询 `Promise.all` 并行；连接串已有 `connect_timeout=15`；本期数据量小，冷启动后单查询毫秒级。
- [数据量增长后 groupBy 全表] → `rentals`/`behavior_logs` 已有 `createdAt` 索引；若量级扩大，改为按索引范围先过滤再聚合（本期不预优化）。
- [推荐次数依赖 `payload.movieIds` 约定] → 与 FU-3 同源约定，解析失败按 0 处理，不抛错。
- [服务器本地时区分桶] → 单时区部署无影响；若将来多时区，迁移为按请求时区或 UTC 参数化（契约预留 `days` 参数不排他）。

## Migration Plan

- 无 schema 变更、无数据库迁移、无新依赖；纯新增只读端点 + 管理页。回滚 = 移除新路由与页面即可，不影响任何现有行为。上线前同步更新 `API_CONTRACT.md`（新端点 + 401/403 语义）与 `ARCHITECTURE.md`（模块与数据流 + §8 决策一行）。

## Open Questions

无——阈值（`stock ≤ 1`）、窗口（趋势 14 天 / 分布 30 天）、端点形态（单端点 overview）均已在需求批准中确认。

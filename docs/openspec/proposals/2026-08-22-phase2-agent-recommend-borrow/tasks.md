# Tasks — Phase 2 Agent 推荐与借阅

Execute in order during `/opsx:apply`. Check boxes only when the item is done in code/docs.

## 1. Data layer

- [ ] 1.1 Prisma：`Profile`、`Rental`（`ACTIVE`/`RETURNED`）、`BehaviorLog`；User 关联；ACTIVE 唯一约束
- [ ] 1.2 迁移（描述性名称，如 `add_profile_rental_behavior_log`）
- [ ] 1.3 Seed：固定 UUID 的 User（dev-user / 建议 dev-admin）+ 代理人 Profile（`likeGenres` 含与 seed 片重合的类型，如「科幻」）
- [ ] 1.4 `pnpm --filter=@fairy/database generate`

## 2. Shared

- [ ] 2.1 Chat 请求 Zod schema（`message`、`movieId`、`sessionId`）
- [ ] 2.2 SSE 事件与 `borrow` payload 类型
- [ ] 2.3 补全 `Profile` / `Rental` 类型与 schema（替换空 `export {}`）
- [ ] 2.4 Schema 单测

## 3. Services

- [ ] 3.1 `ProfileService.getByUserId`
- [ ] 3.2 `BehaviorLogService.append`
- [ ] 3.3 `RentalService.borrow`：事务 + 条件扣库存 + ACTIVE 冲突
- [ ] 3.4 可复用 `movieService` 查询；禁止工具直写 Prisma 绕过 service（movie 读可走现有 service）

## 4. Tools & agent

- [ ] 4.1 `recommendMovieTool`：标签过滤、库存、加权、上限 5
- [ ] 4.2 `borrowMovieTool`：调用 RentalService；标题模糊匹配在 classifier/planner 侧完成后再传 `movieId`
- [ ] 4.3 规则 `intentClassifier` / `planner` / `toolDispatcher` / `responseSynthesizer` / `stateLoop`
- [ ] 4.4 **零** `@fairy/ai-sdk` 运行时调用

## 5. HTTP

- [ ] 5.1 `routes/chat.ts`：校验 body、SSE 写入、调用 stateLoop
- [ ] 5.2 `createApp` 挂载 `authMiddleware` + `/api/chat`
- [ ] 5.3 确认无 `POST /api/borrow` 路由

## 6. Web

- [ ] 6.1 `useSSE` 解析 event/data
- [ ] 6.2 `ChatPage` + `MessageStream` + `RecommendationCard`
- [ ] 6.3 `/chat` 路由与 nav；`zh-CN.json` chrome 文案
- [ ] 6.4 以 `dev-user` 发请求

## 7. Tests

- [ ] 7.1 API：推荐、排除 stock=0、借阅成功、重复借、缺货、unmatched 无日志
- [ ] 7.2 Web：卡片借阅 payload
- [ ] 7.3 `pnpm --filter=@fairy/api test` 与 `pnpm --filter=@fairy/web test`

## 8. Spine docs

- [ ] 8.1 `API_CONTRACT.md` chat 现行、borrow 未来
- [ ] 8.2 `ARCHITECTURE.md` 规则 Agent / 无 Session 表 / 借阅仅工具
- [ ] 8.3 需求文档链接到本提案；**不要**把 Phase 2 标 Completed（留给 archive）

## 9. Verify AC

对照需求 AC-1～AC-11 手工或测试勾选。联调须同时跑 api:3000 与 web:5173，且两处 `DATABASE_URL` 一致（`AGENTS.md` §9）。

## Context

See `proposal.md` and the approved requirements doc (chat-only scope; button + `GET /api/rentals` deferred to FU-8). The rental transaction in `rentalService.borrow` is the pattern to mirror; `Rental`'s composite index `@@index([userId, movieId, status])` already serves the return lookup. Agent is LLM-intent + rule fallback since FU-2; web must remain untouched this round.

## Goals / Non-Goals

**Goals:**

- One write path: chat → intent (LLM or rule) → `returnMovieTool` → `returnRental` transaction → `return` SSE event.
- Idempotent safety: no ACTIVE rental → `RENTAL_NOT_FOUND`, nothing changes.
- Web zero change; reply text still reaches users via the `text` event.

**Non-Goals:**

- Return button UI, `GET /api/rentals`, chat `action` param (FU-8); REST returns; overdue handling; admin returns.

## Decisions

1. **事务镜像 borrow：`findFirst` → `rental.update` → `movie.updateMany` increment**  
   Why: 复合索引正中归还查询；借出时减过 1，回补不会越界，无需条件 guard。  
   Alternative: 条件 updateMany guard —— 对 increment 无意义。

2. **规则 fallback 顺序：borrow 检查之后、tags 之前插入 return 分支**  
   Why: 「还千与千寻」不含「借」，两条链互不干扰；「借了还要还」类句子 borrow 优先可接受。  
   Alternative: return 优先 —— 会让「借千与千寻然后记得还」被误判。

3. **hái/huán 歧义双保险**  
   Why: 规则要求「还」**且**唯一片名匹配；LLM 系统提示词明确「仅明确表达归还影片时输出 return」。  
   Alternative: 只靠 LLM —— 降级路径会失去归还能力。

4. **`RENTAL_NOT_FOUND` 不复用 `MOVIE_NOT_FOUND`**  
   Why: 语义不同（没借过 vs 影片不存在），前端 FU-8 的按钮态依赖此区分。

5. **`RETURN_SUCCESS` 只记成功日志**  
   Why: 与现状对齐（borrow 失败仅记 OUT_OF_STOCK）；失败由 `return` 事件承载。

6. **unresolved 回复由服务端 `listActiveRentals` 提供，不加新端点**  
   Why: 文本回复需要的事实直接查库；`GET /api/rentals` 是 FU-8 给前端用的，两回事。

7. **`return` SSE 事件新增而非复用 `borrow`**  
   Why: 语义正交；FU-8 前端要按事件类型刷新借阅状态。

## Risks / Trade-offs

- [LLM 对「还」误判] → 规则不含片名不判 return；提示词约束；测试覆盖「还可以」。
- [SSE 新事件对旧客户端] → `useSSE` 未知事件静默忽略（已验证的 Phase 2 行为）；`text` 事件照常携带回复。
- [枚举迁移] → Prisma 枚举加值是加法迁移，线上安全；旧数据不受影响。

## Migration Plan

- `prisma migrate dev --name add_return_success_action`（枚举加值）。
- 部署无顺序要求：新事件对旧前端无害；回滚 = 移除 agent 分支，枚举值无害保留。

## Open Questions

None blocking.

## Affected Modules

- `Fairy/packages/shared`：rentalTypes（ReturnErrorCode）、chatTypes（ReturnSseEvent）、behaviorLogSchemas（BEHAVIOR_ACTIONS）
- `Fairy/packages/database`：BehaviorAction 枚举 + 迁移 `add_return_success_action`
- `Fairy/apps/api`：rentalService（returnRental/listActiveRentals）、tools/returnMovieTool、agent（intentClassifier/planner/toolDispatcher/responseSynthesizer/stateLoop）、routes/chat、`__tests__/`
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`
- `Fairy/apps/web` **零改动**

## Next Step

- User reviews artifacts, then `/opsx:apply`

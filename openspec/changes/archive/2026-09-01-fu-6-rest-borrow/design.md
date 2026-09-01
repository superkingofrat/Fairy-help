## Context

See `proposal.md` and the approved requirements doc. `rentalService.borrow` (transaction) and `borrowMovieTool` (service + behavior-log combination) already exist and are exercised by the chat path; FU-6 adds a REST transport over the same functions. `rentalsRouter` is an unmounted placeholder reserved for FU-8's `GET /api/rentals`. Auth is Bearer-only since FU-5 (`res.locals.userId` = token subject).

## Goals / Non-Goals

**Goals:**

- One borrow implementation, two transports: chat tool and REST both call `borrowMovieTool`.
- Thin controller: validateBody → tool → status-code mapping.
- Web zero change; `rentalsRouter` placeholder untouched for FU-8.

**Non-Goals:**

- REST return endpoint, `GET /api/rentals`, card state switching (FU-8), batch borrow, reservations.

## Decisions

1. **路径钉死 `POST /api/borrow`，新建 `borrowRouter`**  
   Why: 路线图与契约 §5 预留均为 `/api/borrow`；`rentalsRouter` 占位留给 FU-8 的 `GET /api/rentals`，两个占位不混用。  
   Alternative: `POST /api/rentals/borrow` —— 与预留命名不一致。

2. **控制器直接调用 `borrowMovieTool`**  
   Why: 它就是「事务 + 日志」的既有封装；REST 复用它杜绝第二套借阅逻辑。命名（tool）在 REST 语境略别扭，可后续更名，非本轮。  
   Alternative: 控制器直调 service 再各自写日志 —— 日志组合分叉风险。

3. **身份仅取 token subject；body 的 userId 忽略**  
   Why: FU-5 身份真实化的自然推论；防越权代借无对应需求。

4. **错误映射：404 / 409 / 409，信封 `{ code, data: null, msg }`**  
   Why: REST 语义标准；错误码字符串与 chat `borrow` 事件完全一致，前端将来可统一处理。

5. **成功 201 而非 200**  
   Why: 创建了 rental 资源；与 movies POST 的 201 惯例一致。

6. **web 零改动**  
   Why: 卡片状态切换归 FU-8 一次做对，避免两轮碰同一组件（FU-4 拆分的同一逻辑）。

## Risks / Trade-offs

- [双入口并发抢同一部片] → 既有事务的条件减库存保证不超卖；重复借 409。
- [chat 与 REST 日志语义漂移] → 两者共用 `borrowMovieTool`，无漂移面。

## Migration Plan

- 部署即生效；回滚 = 移除路由挂载。
- Docs: `API_CONTRACT.md` 新增端点节并从 §5 移除预留；`ARCHITECTURE.md` §8 修订 + §5.2 双入口标注。

## Open Questions

None blocking.

## Affected Modules

- `Fairy/packages/shared`：`rentalSchemas` 增 `borrowRequestSchema`（movieId uuid）
- `Fairy/apps/api`：`routes/borrow.ts`、`controllers/borrowController.ts`、`app.ts`、`__tests__/borrow.test.ts`
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`
- `Fairy/apps/web` **零改动**

## Next Step

- User reviews artifacts, then `/opsx:apply`

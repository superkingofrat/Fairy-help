# FU-8 一键归还 UI（含 rentals 查询端点）

## Goal

为 FU-4 已落地的归还能力补上 UI 入口：chat 页「我的借阅」条一键归还；推荐卡片对已借影片把「借阅」按钮切换为「归还」。唯一来源：`docs/requirements/2026-08-29-fu-8-return-button-ui.md`（已批准，grill-me 收敛四项决策）。

## Requirements

### API

- `GET /api/rentals`（Bearer 必需，挂载 `rentalsRouter` 占位）：本人看自己全部借阅（`createdAt` 倒序）；`?status=ACTIVE` 过滤；admin 可 `?userId=<uuid>` 代查；行 = `{ rentalId, movieId, movieTitle, status, borrowedAt, returnedAt? }`；404 `USER_NOT_FOUND` / 400 `INVALID_USER_ID` / 403 / 401；不分页。
- chat `action?: z.enum(["return"])`（shared `chatRequestSchema`）：**严格联合校验**——action 存在必须带 movieId，否则 400 `VALIDATION_ERROR`；`{ message: "", movieId, action: "return" }` 直达 `returnMovieTool`（`stateLoop` 不经 LLM），message 忽略。

### Web

- chatStore：`activeRentals`，挂载 + 每次 SSE `done` 后 refetch `?status=ACTIVE`；SSE `return` success 乐观移除。
- 「我的借阅」条：顶部常驻、空态整条隐藏；chip + 归还按钮，pending 禁点。
- `RecommendationCard`：`isBorrowed` prop，已借 → 「归还」按钮（不受 `stock<1` 禁用），归还后恢复「借阅」。
- SSE `return` 消费：success → 确认 text + 乐观移除；failure → 聊天流内 text 事件 + refetch 校正。

## Acceptance Criteria

- [ ] AC-1 登录 user 后顶部出现「我的借阅」（ACTIVE 借阅：片名 + 归还按钮）；空态整条隐藏
- [ ] AC-2 点归还 → 聊天流确认 text + chip 消失 + 库存回补（DB：`RETURNED` + `stock+1`）
- [ ] AC-3 卡片已借影片显示「归还」（含 stock=0 也可还）；归还后恢复「借阅」
- [ ] AC-4 两入口重复归还同一影片 → 第二次失败走聊天流道歉 text，状态校正，无 500
- [ ] AC-5 admin `?userId=` 代查 / user 查他人 403 / 不存在 userId 404 / 非 UUID 400
- [ ] AC-6 与 chat 文本归还共用事务日志：REST 借入后按钮归还，流水页出现 `RETURN_SUCCESS`

## Notes

- OpenSpec 轨：需求已批准，下一步 `/opsx:propose` → 用户 approve → apply。
- 设计/实现细节由 OpenSpec proposal + tasks.md 承载（本 task 保持 PRD-only）。

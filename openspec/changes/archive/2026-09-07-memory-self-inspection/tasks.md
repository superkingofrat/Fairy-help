# Tasks: 2026-09-07-memory-self-inspection

## 1. shared：自查 schema

- [ ] 1.1 `memorySchemas.ts` 增加 `memorySelfQuerySchema`（page/limit/kind/keyword，无 userId/email；未知键被 zod 剥除）+ `memorySelfListItemSchema`（id/kind/content/sessionId?/createdAt）+ 类型导出
- [ ] 1.2 shared 测试：schema 解析/剥未知键/分页默认值；`pnpm --filter=@fairy/shared typecheck` + test

## 2. API：GET /api/memories/me

- [ ] 2.1 `memoryService.listOwnMemories(profileId, query)`：`where profileId = 本人` + kind/keyword 过滤 + `createdAt desc` 分页 + total；无 Profile→User join、不含 email
- [ ] 2.2 `routes/memories.ts` 增 `GET /me`（`authMiddleware` 任意角色 + `validateQuery(memorySelfQuerySchema)`）+ `memoryController` handler（`res.locals.userId` 作 profileId）；无 GET `/:id` 冲突
- [ ] 2.3 api 测试：/me 401 匿名 / 200 user+admin / 仅回本人行（构造他人 profileId 行不得返回）/ kind/keyword 过滤与 total / 越权 userId 参数无效；既有 memoriesRoutes/memoryService 用例保持绿

## 3. Web：会话页自查面板

- [ ] 3.1 `lib/memoryApi` 增 `listMyMemories(query)`
- [ ] 3.2 `components/chat/MemorySelfPanel`：只读列表（kind 中文标签 + 内容 + 时间 + 来源标注：`sessionId` 非空 → 对话抽取，否则 → 系统录入）+ 分页 + 加载/错误/空态
- [ ] 3.3 `ChatPage` 加入口按钮展开/收起面板；`locales/zh-CN.json` 补文案（面板标题/来源/空态/错误等）
- [ ] 3.4 web 测试：MemorySelfPanel 渲染/来源标注/空态/加载 + ChatPage 入口切换；既有 ChatPage/App 用例保持绿

## 4. 文档脊柱

- [ ] 4.1 `API_CONTRACT.md` §3.14 增 `GET /api/memories/me` 子节（鉴权/本人隔离/参数忽略/错误码 401）
- [ ] 4.2 `ARCHITECTURE.md` §5.4 自查数据流 + §8 决策行 + §9 模块映射补 `MemorySelfPanel`
- [ ] 4.3 `PROJECT_STATUS.md` 完成后移入 Completed（In Progress 先保持登记）；requirements README FU-17 行置 approved

## 5. 验证与归档

- [ ] 5.1 三包 typecheck + shared/api/web 测试全绿；`openspec validate --all`
- [ ] 5.2 真机验收（双 dev server）：AC-1 铃会话页面板自查（列表/来源标注/空态）；AC-2 跨用户隔离 + admin 管理面不变；AC-3 /me 契约（401/200/忽略 userId）；AC-5 断网错误态
- [ ] 5.3 通过后 `openspec archive 2026-09-07-memory-self-inspection` + 移入 Completed Modules + Trellis journal

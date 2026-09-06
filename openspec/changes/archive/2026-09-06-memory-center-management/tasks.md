## 1. Shared 契约

- [x] 1.1 `memorySchemas.ts` 扩展：`memoryQuerySchema`（page/limit/userId/kind/keyword）、`memoryListItemSchema`（id/userId/email/kind/content/sessionId/createdAt）、`memoryCreateSchema`（userId/kind/content/sessionId?）、`memoryUpdateSchema`（kind?/content? 至少一项）+ 类型导出
- [x] 1.2 `memorySchemas.test.ts` 扩展（query 默认值/非法 kind、listItem 形状、create/update 校验）+ `pnpm --filter=@fairy/shared build`

## 2. API：service + routes

- [x] 2.1 `memory/memoryService`：`listMemories`（join Profile→User 带 email、userId/kind/keyword 过滤、倒序分页 + total）、`createMemory`（Profile 不存在 404 PROFILE_NOT_FOUND）、`updateMemory`、`deleteMemory`（404 MEMORY_NOT_FOUND；沿用 KIND_TO_PRISMA）
- [x] 2.2 新增 `routes/memories.ts` 四端点（全部 `requireRole("admin")`）+ controller 薄封装 + `app.ts` 挂载 `/api/memories`
- [x] 2.3 测试：`memoryService.test.ts` 扩展 + 新增 `__tests__/memoriesRoutes.test.ts`（200/403/401/400/404 全分支）

## 3. Web：admin 管理页

- [x] 3.1 `api/memoryApi.ts`（list/create/update/delete，复用 lib/http 统一客户端）
- [x] 3.2 `AdminMemoryPage`：列表 + 筛选（kind/keyword/userId）+ 分页 + 新增/编辑弹窗 + 删除确认 + 加载/错误/空态 + 路由（`RequireAuth role="admin"`）+ 管理导航 + zh-CN i18n
- [x] 3.3 测试：`AdminMemoryPage.test.tsx` + memoryApi mock

## 4. 文档与验证

- [x] 4.1 `API_CONTRACT.md`：新增 GET/POST/PATCH/DELETE `/api/memories` 契约（请求/响应/错误码）
- [x] 4.2 `ARCHITECTURE.md`：模块与数据流（admin 管理面 ↔ memoryService ↔ Memory 表）+ §8 决策行
- [x] 4.3 `PROJECT_STATUS.md`：In Progress → 完成后移入 Completed
- [x] 4.4 验证：三包 typecheck + api/shared/web 测试全绿 + `openspec validate --all`
- [x] 4.5 真机验收 AC-1~AC-7（admin REST 全链路 + 管理页浏览器 E2E + 管理写入行新会话注入回归 + 非 admin 403）
- [x] 4.6 归档：`openspec archive` → sync 主 spec → journal → 提交

# 需求：FU-17 记忆自查入口 —— 会话页「Fairy 记住了什么」面板（记忆中心四期）

> 状态：**implemented**（2026-09-07，用户批准，OpenSpec 轨；同日交付并归档，提案见 ../../openspec/changes/archive/2026-09-07-memory-self-inspection/proposal.md，验收细节见 PROJECT_STATUS）· 日期：2026-09-07 · 负责人：Flores
> 轨道：OpenSpec（新增公共 API 端点 `GET /api/memories/me`——改 `API_CONTRACT.md`；跨 api + web + shared；**无 DB schema/迁移**）
> 前置：FU-14 记忆中心一期、FU-15 记忆管理面、FU-16 pgvector 向量检索均已交付归档；FU-15 明确把「user-facing self-inspection」列为非目标，本需求承接该缺口。

## 背景 / 问题

1. **记忆只有两类“读者”，独缺当事人**：admin 可经管理面 REST/页面（FU-15）查看全部记忆；服务端把检索到的记忆注入对话 prompt（FU-14/16）。但记忆的本人——聊天用户（如铃）——**没有任何入口核对 Fairy 记住了自己什么**。
2. **引用不可溯源**：会话页里 Fairy 会说出「你最喜欢科幻片，尤其是太空题材的」这类话，用户无从得知这条记忆何时、由谁（对话抽取还是店员录入）写入，缺乏透明性。

## 目标

1. 用户在会话页可查看**本人**被记住的记忆（只读）。
2. 列表时间倒序，逐条带 `kind` 标签与**来源标注**（对话抽取 / 管理录入），可溯源。
3. 严格本人隔离：user 与 admin 角色在会话页都只能自查各自的记忆；admin 的管理面（全部用户）保持不变。

## 范围

- **UI**：会话页（`ChatPage`）加「Fairy 记住了什么」入口按钮 + 展开/收起面板（新增 `components/chat/` 面板组件）；显式处理加载/错误/空态；文案全走 i18n（`locales/zh-CN.json`）。
- **API**：新端点 `GET /api/memories/me`——任意已登录角色（`authMiddleware`），本人身份由 token（`res.locals.userId`）决定，查询强制 `profileId == 本人`；时间倒序；分页与 `kind`/`keyword` 过滤复用管理面 query 语义（对齐，见待决问题 2）；**不支持也不接受 `userId`/`email` 参数**（无视客户端传入）。响应遵循 `{ code, data, msg }`，条目不含 email / embedding / metadata / 他人数据。
- **shared**：memorySchemas 增加 self 查询 schema 与列表项类型（管理面列表项剔除 `email` 后的同构子集：`{ id, kind, content, sessionId?, createdAt }`）。
- **来源标注（零迁移推断）**：`sessionId` 非空 → 「对话抽取」；为空 → 「管理/系统录入」。种子数据归为后者（见待决问题 1）。

## 非目标

- 用户**不可**新增/编辑/删除/修正自己的记忆——本期纯只读；用户改删/「遗忘权」列二期候选。
- 不加显式 `source` 列、不做 DB 迁移；不区分「店员录入」与「种子」的精细来源。
- 不展示 admin 管理面才有的字段（email、其他用户数据）；不展示 embedding/向量相关信息。
- 不做会话页之外的独立自查页面 / 个人中心。
- 不做记忆数量治理（如折叠/摘要）；本期分页即够。

## 受影响模块

| 模块 | 改动 |
|---|---|
| `packages/shared` | `memorySchemas`：self 查询 schema + 列表项类型；测试 |
| `apps/api` | `routes/memories.ts` 增 `GET /me`（当前无 `GET /:id`，无路由顺序冲突）；`memoryService` 增 `listOwnMemories(profileId, query)`（不含 Profile→User join）；`memoryController` 增 handler；走现有 `authMiddleware` |
| `apps/web` | `components/chat/` 面板组件 + `ChatPage` 入口按钮；`lib/memoryApi` 增 `listMyMemories`；`locales/zh-CN.json`；路由无需动 |
| 文档 | `API_CONTRACT.md` §3.14 增 `/me` 子节（含 401/200 与隔离说明）；`ARCHITECTURE.md` §5.4 自查数据流 + §8/§9；`PROJECT_STATUS.md` |

## 验收标准（草案）

- **AC-1**：登录 user（铃）在会话页点「Fairy 记住了什么」→ 面板列出其本人记忆：时间倒序、逐条带 kind 标签与来源标注（有 sessionId 的条目标「对话抽取」，admin 录入/种子条目标「管理/系统录入」）；空态与加载态正常。
- **AC-2**：跨用户隔离——铃与另一用户各自只见自己；admin 自查只见 admin 自己的记忆，且 admin 管理面列表行为不变。
- **AC-3**：`GET /api/memories/me` 契约——无 token 401；user/admin 200；响应 `{code:"OK", data:{items, pagination}, msg}`；条目无 email/embedding/他人数据；请求带 `userId`/`email` 等越权参数被忽略（不按它过滤）。
- **AC-4**：测试——api 单测覆盖鉴权（401/200）、本人隔离（构造他人 profileId 的记忆不得返回）、分页/kind/keyword 过滤；web 面板组件单测（展开/收起、列表渲染、空态）；shared schema 测试；全程 mock DB/LLM，不碰真实库与供应商。
- **AC-5**：涉及三包 typecheck + 单测全绿；双 dev server 真机手动过一遍展开/收起与断网错误态。

## 待决问题（默认倾向，提案阶段定稿）

1. **来源归类的边界**：FU-14 种子记忆无 `sessionId`，会显示为「管理/系统录入」而非「对话抽取」——可接受？默认倾向：可接受（种子仅演示用；文案用中性「系统录入」）。
2. **/me 的查询能力**：对齐管理面（page/limit/kind/keyword）还是面板一期只取最近 N 条不带过滤？默认倾向：带 page/limit + kind/keyword（复用语义，前端默认每页 20），避免二期返工。
3. **列表项字段**：是否下发 `metadata`（如偏好数值）？默认倾向：不下发，面板只显示 kind + content + createdAt。

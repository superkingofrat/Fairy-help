# Journal - Flores (Part 1)

> AI development session journal
> Started: 2026-08-19

---



## Session 1: Movie CRUD MVP delivery and agent norms

**Date**: 2026-08-20
**Task**: Movie CRUD MVP delivery and agent norms
**Branch**: `master`

### Summary

Delivered Movie CRUD (Prisma, REST, admin UI, tests). Fixed local dev pitfalls: sync DATABASE_URL in packages/database/.env and apps/api/.env; run api:3000 and web:5173 together; restart API after env changes. Added AGENTS §15 approval gates and database-guidelines dual-env spec. Archived task 08-19-movie-crud.

### Git Commits

| Hash | Message |
|------|---------|
| `714538b` | (see git log) |

### Status

[OK] **Completed**


## Session 2: Phase 2 落库与仓库安全加固；FU-1 画像写接口全流程交付

**Date**: 2026-08-29
**Task**: Phase 2 落库与仓库安全加固；FU-1 画像写接口全流程交付
**Branch**: `master`

### Summary

Took over the project on ZCode (migrated from Cursor); committed the whole uncommitted Phase 2; fixed repo security hygiene; delivered FU-1 end to end via /opsx:apply and archived it.

### Main Changes

### 改动

- **Phase 2 落库**：发现整个 Phase 2 实现（agent 引擎、推荐/借阅工具、Profile/Rental/BehaviorLog、chat 页）只存在于工作区——git HEAD 里全是 0 字节占位文件，而 PROJECT_STATUS 已写"已交付"。以 `agent: implement phase 2...` 一笔提交（46 文件）。
- **仓库安全加固**：根 `.gitignore` 是 UTF-16 编码，git 完全不解析 → 根 `.env`（真实 DATABASE_URL/OpenAI/Claude key/JWT_SECRET）对 git 裸奔。重写为 UTF-8；逐键比对（值打码）确认根 `.env` 只是 `apps/api/.env` 的过时子集后删除；顺带删除根 helper `package.json`/`pnpm-lock.yaml`/`node_modules` 和 UTF-16 的根 `.env.example`。
- **FU-1 画像写接口与管理 CRUD（OpenSpec 轨）**：`/opsx:apply` 实现 16/16 任务——复数 REST `/api/profiles`（admin 列表按 User 展开、补建 409、PATCH 原子更新、无 DELETE）、shared Zod、`/admin/profiles` 管理页 + i18n、API_CONTRACT §3.8 改复数并新增 `USER_NOT_FOUND`/`PROFILE_ALREADY_EXISTS`。用户验收通过后 `/opsx:archive`：主 spec `user-profile` 同步 7 条需求（撤销"不得提供写 API"禁令），PROJECT_STATUS 更新。

### 验证

- shared 18 / api 40 / web 10 测试全绿（新增 33：schema 11、路由 15、recommend 排序 3、页面 4）；三包 typecheck 通过；`openspec validate` 通过。
- 推荐 PATCH 联动有专门测试：PATCH `likeGenres` 后同 mood/scene 下排序按精确相交翻转。

### 踩坑（下次直接避）

1. **UTF-16 `.gitignore` 会让所有规则静默失效**——ignore 规则"不生效"时先查编码。另外 ZCode 的 Write 工具会保留文件原编码（写完还是 UTF-16），强转 UTF-8 得用 bash heredoc。
2. **状态文档说"已交付" ≠ 已提交**——接手时用 `git cat-file -s` 抽查 HEAD 里关键文件的字节数，0 字节占位一眼识破。
3. **提交前隐私审计套路**：`sed 's/=.*/=<REDACTED>/'` 看键名，跨 env 文件做值包含比对确认冗余后才删；命中"唯一值"先甄别类型（`CLAUDE_MODEL=claude-3-5-sonnet-latest` 是模型名不是凭证，虚惊）。
4. **改 `packages/shared` 后要先 `pnpm --filter=@fairy/shared build`**——apps 的 typecheck 解析的是 dist，不重建会报"has no exported member"（AGENTS §9 有写，实操还是踩了）。
5. **Vitest + RTL 未开 globals 时无自动 cleanup**——同文件多个 render 会 DOM 叠加导致 "Found multiple elements"；`afterEach(cleanup)` + 优先用 role 查询（heading 与 button 区分）。

### 下一步

- FU-2 真实 LLM 替换规则意图与模板回复（OpenSpec 轨；届时按 AGENTS §12 把 provider key 变量名登记进 `apps/api/.env.example`）。
- `学习过程.md` 有未提交改动（用户个人笔记），保持不动由用户处置。



### Git Commits

| Hash | Message |
|------|---------|
| `361d0a6` | (see git log) |
| `218832f` | (see git log) |
| `89ec6c5` | (see git log) |
| `d104dd3` | (see git log) |
| `8e73de6` | (see git log) |
| `a98a159` | (see git log) |
| `f1d7667` | (see git log) |

### Status

[OK] **Completed**


## Session 3: FU-2 真实 LLM 交付：ai-sdk 三供应商 + 意图/回复 LLM 化 + 规则降级

**Date**: 2026-08-29
**Task**: FU-2 真实 LLM 交付：ai-sdk 三供应商 + 意图/回复 LLM 化 + 规则降级
**Branch**: `master`

### Summary

Delivered FU-2 end to end through the OpenSpec gates (approve -> propose -> review -> apply -> accept -> archive); built @fairy/ai-sdk from zero and swapped rule/template agent internals for LLM with graceful fallback.

### Main Changes

### 改动

- **`@fairy/ai-sdk` 从零落地**：统一 `chat()/stream()/embed()` 接口 + usage 元数据；DeepSeek（默认 `deepseek-v4-flash`，OpenAI 兼容 adapter，与 OpenAI 共用同一 adapter 换 baseURL）、OpenAI、Claude 三家纯 fetch 实现；类型化错误（MISSING_API_KEY/UNKNOWN_PROVIDER/TIMEOUT/HTTP_5XX/RATE_LIMITED/PARSE/EMBED_UNSUPPORTED，不泄漏供应商响应体）；env 工厂（AI_PROVIDER/AI_MODEL/AI_TIMEOUT_MS）；移除脚手架遗留、从未使用的 `openai` npm 依赖（零新增依赖）。
- **agent LLM 化**：`llmClient`（缓存 provider、`tryChat -> null` 统一降级信号、输入清洗）；意图 = LLM 结构化 JSON（zod 校验，借片只产片名走 title-match，LLM 永不产 movieId，非枚举口语如「emo→致郁」映射，新增 chitchat 不调工具）；回复 = LLM 只引用工具观察事实 + profile（防幻觉），Phase 2 模板整体保留 fallback；`stateLoop` 单次读 profile 共享。
- **OpenSpec 全流程**：需求批准 → propose（新能力 ai-provider + agent-chat MODIFIED/ADDED delta）→ 用户审阅后 apply → 真机验收（DeepSeek 走通「emo 推荐」与「借千与千寻」库存事务）→ archive；主 specs 同步（ai-provider 新建 3 条、agent-chat 扩到 6 条）。

### 验证

- 四包 98 测试全绿（ai-sdk 13 + api 57 + web 10 + shared 18），四包 typecheck 通过；原 7 个路由测试零改动通过——测试环境无 key 自动走降级路径，等价于降级验收的自动化版；SSE 事件名/负载形状与 Phase 2 契约完全一致，前端零改动。

### 踩坑（下次直接避）

1. **上轮回滚的三个笔误本源**：测试文件导入路径写错（`../factory` 应为 `./factory`）、跨 describe 引用作用域变量、未使用的 import——重写时先想清楚文件位置再动手。
2. **`pnpm typecheck | tail` 的退出码是 tail 的**——`&&` 链上的 `echo ✅` 在 typecheck 失败时也会打印；要单独 `echo exit=$?`。
3. **openspec validate 的 MODIFIED 规则**：MODIFIED 块必须携带原 requirement 的全部场景且场景名不能改，否则 archive 拒绝（丢场景 = 拒绝静默丢失）。
4. **工具机制两连**：0 字节占位文件和 `git restore` 过的文件都要先 Read 再 Write/Edit，否则工具直接拒绝。
5. **测试失败先甄别是产品 bug 还是场景设计错**：LLM 片名「星际穿越」精确命中一部 → 正确 borrow；要测「不唯一」场景得用部分匹配（如「星际」命中两部）。
6. **联调前提**：用户在 `apps/api/.env` 补 `DEEPSEEK_API_KEY` 后必须重启 API（§9 惯例）；无 key 时全链路自动降级，开发与 CI 完全不依赖真 key。

### 下一步

- FU-3 BehaviorLog 查询与流水 UI（小切片，按 §15 可能走 Trellis 轨，比 OpenSpec 轻）。
- `学习过程.md` 仍是用户未提交的个人笔记，保持不动。



### Git Commits

| Hash | Message |
|------|---------|
| `58cbd61` | (see git log) |
| `40c3036` | (see git log) |
| `51f3a97` | (see git log) |

### Status

[OK] **Completed**

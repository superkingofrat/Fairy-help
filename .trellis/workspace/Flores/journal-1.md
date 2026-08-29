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

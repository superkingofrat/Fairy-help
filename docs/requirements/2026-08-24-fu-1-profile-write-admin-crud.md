# FU-1 画像写接口与管理 CRUD

**Date:** 2026-08-24
**Status:** implemented（已交付并归档；真机验收与归档记录见 PROJECT_STATUS.md Completed Modules）
**Complexity:** complex

## Goal

绳匠在 `/admin/profiles` 维护已有用户的代理人画像；写接口落库后，`recommendMovieTool` 下次调用即按新的 `likeGenres` 加权。不再只能靠 seed 改人设。

## Background

- Phase 2 已交付 `Profile` 表、seed「铃」（`dev-user`）、`ProfileService.getByUserId` 只读；推荐对 `likeGenres` 与影片 `genres` 做精确集合相交。挂钩见 [2026-08-21-phase2-agent-recommend-borrow.md](./2026-08-21-phase2-agent-recommend-borrow.md) FU-1。
- Prisma：`Profile` 1:1 `User`（`userId` PK）；字段 `name`、`avatarUrl`、`styleTags`、`likeGenres`、`avoidFood`、`dietPreference`、`travelStyle`。`User` 仅 `email` + `role`。
- Seed：`dev-user` 有画像；`dev-admin` 无画像（`Fairy/packages/database/prisma/seed.ts`）。
- `GET /api/profile/:userId` 写在 `API_CONTRACT.md` §3.8 但未实现；`profilesRouter` 占位且未挂载。`PATCH` 仍在契约 §5「未来端点」。
- 认证仍为 dev stub（FU-5）。影片写操作 `requireRole("admin")`。聊天说话人固定 `dev-user`。

## Requirements

- **REQ-1** 挂载并实现复数资源 `/api/profiles`。废弃未实现的单数 `/api/profile/:userId`，同步 `API_CONTRACT.md`。
- **REQ-2** `GET /api/profiles`：仅 admin。按每个已有 `User` 一行，形状 `{ userId, email, role, profile: Profile | null }`。本轮不做分页。
- **REQ-3** `GET /api/profiles/:userId`：本人或 admin；无画像 `404 PROFILE_NOT_FOUND`；非法 UUID `400 INVALID_USER_ID`；既非本人也非 admin `403 FORBIDDEN`。
- **REQ-4** `POST /api/profiles`：仅 admin。为**已有且尚无 Profile** 的 User 补建。body 含 `userId` 与全部画像可写字段；`name` 必填非空。User 不存在 `404 USER_NOT_FOUND`；已有画像 `409 PROFILE_ALREADY_EXISTS`。非 admin `403 FORBIDDEN`。
- **REQ-5** `PATCH /api/profiles/:userId`：仅 admin。部分更新画像字段，不可改 `userId`。无画像 → `404 PROFILE_NOT_FOUND`。更新须原子（单次 Prisma update）。
- **REQ-6** 不提供 DELETE Profile / User；不创建新 User。
- **REQ-7** 可写字段为现有列：`name`、`avatarUrl`、`styleTags`、`likeGenres`、`avoidFood`、`dietPreference`、`travelStyle`。三个数组为自由字符串（可空数组）；不做新枚举。空 `avatarUrl` 存 `null`。旅行/饮食只落库，本轮工具不读取。
- **REQ-8** Zod schema 放 `packages/shared`；响应 `{ code, data, msg }`。`ProfileService` 承担读写；Agent 工具仍只读，不经对话改画像。
- **REQ-9** 前端 `/admin/profiles`：导航与 `/admin/movies` 并列；按 User 一行；无画像补建、有画像编辑；数组字段逗号分隔；加载/错误/空状态；文案 i18n（`zh-CN.json`）。不改 chat 页。
- **REQ-10** API 与 Web 测试覆盖鉴权、补建、更新、404/409、非 admin 写失败。改「铃」的 `likeGenres` 后，同 mood/scene 下推荐排序随精确相交变化（可用现有 recommend 单测或 API 测断言服务层）。
- **REQ-11** 实现后更新 `API_CONTRACT.md`、`ARCHITECTURE.md`（若列表形状需写明）、`PROJECT_STATUS.md`。无 Prisma 扩表则不新增迁移。

## Acceptance Criteria

- **AC-1** `X-Dev-Role: user` 调用 `GET /api/profiles`、`POST /api/profiles`、`PATCH /api/profiles/:userId` 均为 403 `FORBIDDEN`。映射 REQ-2/4/5。
- **AC-2** admin `GET /api/profiles` 至少包含 seed 的 `dev-user`（`profile` 非 null）与 `dev-admin`（`profile` 为 null）。映射 REQ-2。
- **AC-3** 本人（`dev-user`）可 `GET /api/profiles/{DEV_USER_ID}` 得到「铃」；请求其他 `userId` 为 403。admin 可读任意存在的画像。映射 REQ-3。
- **AC-4** admin 为 `dev-admin` 补建画像后，列表该行 `profile` 非 null；再次 POST 同一 `userId` 为 409 `PROFILE_ALREADY_EXISTS`。映射 REQ-4。
- **AC-5** admin PATCH「铃」的 `likeGenres` 后，GET 单条反映新值；随后 `recommendMovieTool` 对相同 mood/scene 的排序使用新偏好（精确相交）。映射 REQ-5/7/10。
- **AC-6** PATCH 不存在的画像、GET 无画像用户 → 404 `PROFILE_NOT_FOUND`；POST 未知 `userId` → 404 `USER_NOT_FOUND`。映射 REQ-3/4/5。
- **AC-7** 不存在 DELETE `/api/profiles/:userId`（404 路由或不注册该方法）。映射 REQ-6。
- **AC-8** `/admin/profiles` 可完成：查看两行用户、编辑铃、为无画像用户补建；校验失败信息展示在页内。映射 REQ-9。
- **AC-9** `pnpm --filter=@fairy/api test` 与 `pnpm --filter=@fairy/web test` 在改动范围内通过。映射 REQ-10。

## In Scope

- `ProfileService` 列表（按 User 展开）、读取、补建、更新
- REST `/api/profiles` 四方法（无 DELETE）
- shared Zod / 类型
- `/admin/profiles` + 导航 + i18n
- 契约从单数改为复数；错误码 `USER_NOT_FOUND`、`PROFILE_ALREADY_EXISTS`
- 测试与脊柱文档同步

## Out of Scope

- 删除 Profile / User；创建 User（FU-5）
- 聊天侧自助改画像；对话写画像
- `likeGenres` 受控枚举或从片库多选
- 列表分页、头像上传（仅 URL 字符串）
- BehaviorLog 记录画像变更（FU-3）
- FU-2～FU-7、旅行工具读取饮食/旅行字段、记忆中心向量化
- Prisma 新列

## Key Decisions

| Decision | Choice | Rationale | Trade-off |
|---|---|---|---|
| 写入主体 | 仅 admin | 绳匠录入、代理人被服务；对标影片库 | 代理人不能自助改偏好 |
| 操作集合 | 列表 + GET + 已有 User 补建 + PATCH；不删、不新建 User | 覆盖无画像边，不滑入用户体系 | 不能删错画像自救 |
| 列表模型 | 按 User 一行，`profile` 可 null | 否则看不到 `dev-admin` 补建 | 列表混入 User 摘要 |
| 可写字段 | 全现有列；数组自由字符串 | 不扩表；推荐仍只吃 `likeGenres` 精确相交 | 拼写不一致则加权无效 |
| REST | 复数 `/api/profiles`；列表仅 admin；单条 GET 本人或 admin | 与 movies 一致；无现存客户端 | 改掉契约 §3.8 单数 |
| 管理 UI | 本轮 `/admin/profiles` | 功能名含管理 CRUD；可演示改偏好再 chat | 比纯 API 切片大 |
| 认证 | 继续 dev stub | FU-5 另做 | 身份仍靠请求头 |

## Technical Notes

- **数据：** 不改 Prisma schema。补建 = `profile.create`（User 必须已存在）；更新 = `profile.update`。`User` 与 `Profile` 不要在本轮拆事务建号。
- **列表查询：** `user.findMany` include `profile`，不要只 `profile.findMany`。
- **路由：** `app.ts` 挂载 `authMiddleware` + `profilesRouter`，与 movies 相同。
- **鉴权：** 写与列表 `requireRole("admin")`；单条 GET 比较 `res.locals.userId` 与路径 `userId`，或 `role === "admin"`。
- **联动：** 推荐无缓存，PATCH 后下一轮 `/api/chat` 即读新画像；不必改 tool 签名。
- **错误码：** 新增 `USER_NOT_FOUND`（404）、`PROFILE_ALREADY_EXISTS`（409）；沿用 `PROFILE_NOT_FOUND`、`INVALID_USER_ID`、`FORBIDDEN`、`VALIDATION_ERROR`。
- **前端：** 对标 `MoviesAdminPage`（体积可拆子组件）；`X-Dev-Role` 与影片页同一套 admin 调用方式。

## Risks & Open Questions

（无阻塞项）

## Affected Modules

- `Fairy/apps/api/src/routes/profiles.ts`、`controllers/profileController.ts`、`services/profileService.ts`、`app.ts`、`__tests__/`
- `Fairy/packages/shared` profile schemas/types
- `Fairy/apps/web`：`App.tsx` 路由/导航、新管理页、`locales/zh-CN.json`、测试
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`（实现阶段）

## Next Step

- [x] User approves this doc
- [x] Run `/opsx:propose`（change：`fu-1-profile-write-admin-crud`）
- [ ] User reviews artifacts, then `/opsx:apply`

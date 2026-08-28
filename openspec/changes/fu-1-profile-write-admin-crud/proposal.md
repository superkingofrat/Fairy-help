## Why

Phase 2 把 `Profile` 和 seed「铃」钉死了，推荐会读 `likeGenres`，但明确禁止写接口和管理页。绳匠无法改人设，演示只能改 seed 或 SQL。grill-me 需求已批准（`docs/requirements/2026-08-24-fu-1-profile-write-admin-crud.md`）。

## What Changes

- 实现复数 REST `/api/profiles`：admin 列表（按 User 一行，`profile` 可 null）、admin 补建与 PATCH、本人或 admin 读单条。不提供 DELETE，不创建 User。
- **BREAKING（契约文档）：** 废弃从未实现的单数 `GET /api/profile/:userId`；`PATCH /api/profile/:userId` 从「未来端点」改为现行复数路径。无运行时客户端依赖。
- 新增 `/admin/profiles`（对标影片管理）：补建无画像用户、编辑已有画像；全现有字段；数组自由字符串。
- `ProfileService` 从只读扩展为列表/补建/更新；Agent 工具仍只读。无 Prisma 扩表。
- 同步 `API_CONTRACT.md`、`ARCHITECTURE.md`；Apply 完成后再 archive 并更新 `PROJECT_STATUS.md`。

## Capabilities

### New Capabilities

- （无。画像能力已存在。）

### Modified Capabilities

- `user-profile`: 撤销「本阶段不得提供写 API / 管理编辑器」；增加 admin CRUD（无删除）、按 User 展开的列表、契约改为 `/api/profiles`。seed 可读与「无画像不阻断推荐」保持不变。

## Impact

- 代码：`Fairy/apps/api`（挂载 profiles 路由、controller、service）、`Fairy/packages/shared`（Zod）、`Fairy/apps/web`（`/admin/profiles`、导航、i18n）
- 不改 Prisma schema / 迁移；不调用 `@fairy/ai-sdk`
- 认证继续 dev stub；列表与写仅 admin
- 新增错误码：`USER_NOT_FOUND`（404）、`PROFILE_ALREADY_EXISTS`（409）
- 需求来源：`docs/requirements/2026-08-24-fu-1-profile-write-admin-crud.md`

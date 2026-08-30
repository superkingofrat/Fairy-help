## Why

认证仍是 Phase 1 的 dev auth stub（`X-Dev-Role` 头 / `Bearer dev-<role>`）：三个 admin API client 写死 admin、chat 说话人固定 dev-user，「点进去就是 admin 身份」。2026-08-19 决策已定性 stub 为过渡方案，「上生产前必须完成」。`JWT_SECRET` 早已在 `.env` 备好但无任何代码消费；`User` 模型连密码字段都没有。grill-me 需求已批准（`docs/requirements/2026-08-30-fu-5-jwt-auth.md`），用户拍板**仅登录**：注册/建号拆出挂路线图。

## What Changes

- `User` 增加 `passwordHash`（迁移 `add_user_password_hash`）；seed 为两个种子用户写入 bcrypt 哈希（固定开发密码，demo-only）。
- 新增 `POST /api/auth/login`（bcrypt 校验 → HS256 JWT 12h，payload `{ userId, role }`）与 `GET /api/auth/me`；凭证错误统一 401 不区分原因。
- `authMiddleware` 重写：只认 `Authorization: Bearer <jwt>`；`X-Dev-Role` 与 `Bearer dev-*` 路径**彻底删除**；`requireRole` 语义不变；`JWT_SECRET` 启动必填校验（缺失拒绝启动）。
- web：`authStore`（zustand + localStorage 持久化）、`authApi`、`/login` 页、路由守卫（`/chat` 需登录、`/admin/*` 需 admin）、4 个 API client 改为注入 `Authorization` 并统一 401 拦截跳登录、导航按角色渲染 + 退出按钮。
- 测试迁移：`authHeader(role)` 助手签真 JWT，全部 stub 请求头替换；新增 auth 路由测试与 web 登录/守卫测试。
- 同步 `API_CONTRACT.md`（认证节改 JWT、新增 auth 端点、删各端点"开发环境认证"段）、`ARCHITECTURE.md`；Apply 完成后 archive 并更新 `PROJECT_STATUS.md`。

## Capabilities

### New Capabilities

- `user-auth`: 登录签发、Bearer-only 中间件、启动密钥校验、web 登录与守卫。

### Modified Capabilities

- `agent-chat`: Chat UI 需求中的「stub user identity」改为真实登录身份（Bearer token），chat 说话人 = 登录者。

## Impact

- 代码：`Fairy/packages/database`（User.passwordHash + 迁移 + seed）、`Fairy/packages/shared`（authSchemas）、`Fairy/apps/api`（auth 路由、middleware 重写、index.ts env 校验、依赖 +2、全部测试头迁移）、`Fairy/apps/web`（authStore/authApi/login 页/守卫/4 client/导航/i18n/测试）
- 新增依赖：`jsonwebtoken`、`bcryptjs`（api）
- 环境变量：`JWT_SECRET` 由可选变必填（`.env.example` 注明）；新增环境变量：无
- 行为流水/画像/借还的 userId 语义不变——来源从 stub 常量变为 JWT payload
- 需求来源：`docs/requirements/2026-08-30-fu-5-jwt-auth.md`

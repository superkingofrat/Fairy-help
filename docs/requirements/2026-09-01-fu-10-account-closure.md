# FU-10 账号体系闭环：注册 / 登录限速 / refresh token

- 状态：approved
- 日期：2026-09-01
- 负责人：Flores
- OpenSpec 提案：[fu-10-account-closure](../../openspec/changes/fu-10-account-closure/)

## 背景 / 问题

FU-5 仅交付了「登录 + JWT」，并在 design.md 中明确将注册/建号、refresh token、登录限速全部 deferred 挂账（PROJECT_STATUS Next Steps 长期挂着这三项）。现状：

- 新用户**无法自助建号**，所有账号只能靠 seed 的固定开发密码，demo 可用但离「产品」差一步，且固定密码上线前必须改密。
- `POST /api/auth/login` **无限速**，可被暴力破解（FU-5 已标注风险）。
- access token 只有 12h 单 token：过期即强制重登，无刷新机制，也无法服务端吊销。

## 目标

补齐账号体系闭环：

1. 用户可自助注册（邮箱 + 密码），注册即登录。
2. 登录/注册按 IP 限流，防暴力破解与批量注册。
3. 引入 refresh token（DB 落库、旋转、可吊销）：access 过期后静默续期；登出可服务端吊销。

## 范围

- 后端：`POST /api/auth/register`、`POST /api/auth/refresh`、`POST /api/auth/logout`；`login` 响应增加 `refreshToken`；登录/注册限流（429）。
- 数据库：新增 `RefreshToken` 表（token 哈希存储、过期时间、吊销、旋转链）。
- 共享：`registerSchema`、`refreshTokenSchema` + 类型。
- 前端：注册页、`/register` 路由、authStore 持久化 refreshToken、抽公共 http 客户端实现 401 单飞刷新自动续期、登出调用服务端吊销。

## 非目标

- 不改 `authMiddleware` / `me` 的现有语义；不引入 OAuth/第三方登录。
- 不自动创建 Profile（注册只建 User；Profile 仍走 FU-1 的 admin 补建流程，与 dev-admin 无画像现状一致）。
- 不开放 admin 注册（admin 只经 seed 手动创建）。
- 不做密码找回/重置、邮箱验证。
- 不引入「记住我」双策略、多设备管理 UI、token 主动续期定时器（本期只做 401 被动刷新）。

## 受影响模块

- `packages/database`（Prisma schema + 迁移）
- `packages/shared`（authSchemas + 导出 + 测试）
- `apps/api`（auth routes/controller/service + app.ts 限流 + 测试）
- `apps/web`（RegisterPage、authStore、http 客户端、authApi、路由、i18n、测试）
- 脊柱文档：`API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`

## 验收标准

- AC-1：注册页可提交 email + 密码 + 确认密码；校验失败显示字段级中文提示；成功即登录并跳转（user → /chat）。
- AC-2：`POST /api/auth/register` 返回 201 `{ code:"OK", data:{ token, user, refreshToken } }`；email 已存在 → 409 `EMAIL_ALREADY_EXISTS`；邮箱/密码格式错 → 400 `VALIDATION_ERROR`。
- AC-3：`POST /api/auth/login` 返回体含 `refreshToken`；错误密码与未知邮箱仍返回相同 401（防枚举不受影响）。
- AC-4：同一 IP 连续 10 次错误登录后，第 11 次起返回 429 `TOO_MANY_REQUESTS`，提示语友好。
- AC-5：`POST /api/auth/refresh` 用有效 refresh token 换取新 `{ token, refreshToken, user }`；旧 token 立即失效（旋转）。
- AC-6：复用已旋转/已吊销的 refresh token → 401 `INVALID_REFRESH_TOKEN`，并吊销该用户全部 refresh token（强制重登）。
- AC-7：`POST /api/auth/logout` 吊销当前 refresh token；此后再用它 refresh → 401。
- AC-8：web 端 access 过期后（401）自动经 refresh 续期并重试原请求，用户无感知；刷新失败才登出跳 /login。
- AC-9：登出后刷新页面不再自动恢复会话（authStore 清空 token + refreshToken）。

## 待决问题

- 429 的窗口/阈值（默认 10 次/15 分钟/IP）是否需做成环境变量？本期先用常量 + 契约文档标注，需要时再抽 env。

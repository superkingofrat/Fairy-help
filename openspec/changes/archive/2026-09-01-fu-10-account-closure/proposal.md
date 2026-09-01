## Why

FU-5 只交付了「登录 + JWT」，注册/建号、refresh token、登录限速被明确 deferred 挂账。现状：新用户无法自助建号（账号只能靠 seed 固定开发密码）；`POST /api/auth/login` 无限速可被暴力破解；access token 12h 单 token，过期强制重登、无法服务端吊销。账号体系未闭环，demo 可用但离「产品」差一步。

## What Changes

- **DB**：新增 `RefreshToken` 表（Prisma + 迁移）——随机不透明 token 的 sha256 哈希（`tokenHash @unique`，不明文）、`userId` FK、`expiresAt`（30d）、`revokedAt`、`replacedByTokenId` 自关联（旋转链）、`createdAt`。
- **API**（全部免认证，`authMiddleware` 零改动）：
  - `POST /api/auth/register`：`{ email, password }`（`registerSchema`，password 6~72），bcrypt(cost 10) 建 `role="user"` 用户，不自动建 Profile；email 冲突 → 409 `EMAIL_ALREADY_EXISTS`；成功 201 返回 `{ token, user, refreshToken }`（注册即登录，形状同 login）。
  - `POST /api/auth/login`：响应增加 `refreshToken`（既有权重不变，凭证错误仍统一 401 防枚举）。
  - `POST /api/auth/refresh`：`{ refreshToken }` 校验 → 旋转（旧置 `revokedAt` + `replacedByTokenId`，发新对）→ `{ token, refreshToken, user }`；复用已吊销/已替换 token → 401 `INVALID_REFRESH_TOKEN` 并吊销该用户全部 refresh token（强制重登）。
  - `POST /api/auth/logout`：`{ refreshToken }` 吊销当前 token。
  - 登录/注册限流：express-rate-limit，login `10 次/15 分钟/IP`、register `20 次/小时/IP` → 429 `TOO_MANY_REQUESTS`（统一 `{ code, data, msg }` 形状）；限流器在 `createApp()` 内创建保证测试隔离；生产反代需 `trust proxy`（契约文档标注）。
- **Shared**：`authSchemas.ts` 新增 `registerSchema`、`refreshTokenSchema` + 类型（`RegisterInput`、`RefreshTokenInput`），经 `@fairy/shared` 导出。
- **Web**：`RegisterPage`（email/password/confirmPassword，复用共享 zod 校验 + 字段级 i18n 错误，成功即 `setSession` 跳转）；`/register` 公开路由 + 登录页入口链接；`authStore` persist 增加 `refreshToken`；抽公共 `lib/http.ts`（带 Authorization、解 `{code,data,msg}`、401 → **单飞刷新** → 重试原请求 → 刷新失败才登出跳 /login），`movieApi/profileApi/sessionApi/behaviorApi/rentalsApi` 改用之（导出签名不变）；`authApi` 增加 `register/refresh/logout`；登出改为调用服务端吊销后 `clear()`。
- **无破坏性变更**：`authMiddleware`、`me`、现有端点与错误码全部保留；login 响应仅增字段。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `user-auth`：现有「登录签发 JWT + me 恢复会话」需求保留；新增注册（自助建号，role=user，冲突 409）、refresh token 旋转与复用吊销、登出吊销、登录/注册限流（429）等需求与场景。

## Impact

- `packages/database`：`schema.prisma` 新增 `RefreshToken` + 迁移。
- `packages/shared`：`authSchemas.ts` 新增 register/refreshToken schema 与类型 + 测试。
- `apps/api`：`authService` 扩展（registerUser、issueRefreshToken、rotateRefreshToken、revokeRefreshToken、sha256 哈希、复用检测全家吊销）；`authController` +2 handler（register/refresh/logout）+ login 响应加 refreshToken；`app.ts` 挂限流器与 `/api/auth` 新路由；`auth.test.ts` 扩展。
- `apps/web`：`RegisterPage`、`lib/http.ts` 公共客户端 + 5 个 api 迁移、`authStore` + refreshToken、`authApi` 新方法、路由与 i18n、测试（RegisterPage/http/authStore/App）。
- 文档脊柱：`API_CONTRACT.md`（§3.1 auth 端点 + §4 新增 `EMAIL_ALREADY_EXISTS`(409)/`TOO_MANY_REQUESTS`(429)/`INVALID_REFRESH_TOKEN`(401)）、`ARCHITECTURE.md`（认证流程 + §8 决策 +2 行）、`PROJECT_STATUS.md`（In Progress FU-10，Next Steps 摘掉三项挂账）。

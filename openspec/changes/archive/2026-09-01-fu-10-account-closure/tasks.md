# FU-10 Account Closure — Tasks

## 1. DB + shared

- [ ] 1.1 `schema.prisma` 新增 `RefreshToken` 模型（tokenHash @unique、userId FK 索引、expiresAt、revokedAt?、replacedByTokenId? 自关联、createdAt）+ 迁移 `add_refresh_token_table`；`pnpm --filter=@fairy/database generate`
- [ ] 1.2 `authSchemas.ts` 新增 `registerSchema`（email + password 6~72）与 `refreshTokenSchema`（min 1）+ 类型；经 `schemas/index.ts` / 包入口导出
- [ ] 1.3 shared 测试：registerSchema 有效/非法 email/密码过短、refreshTokenSchema

## 2. API

- [ ] 2.1 `authService` 扩展：`registerUser`（bcrypt + create，P2002 → EMAIL_ALREADY_EXISTS）、`issueRefreshToken`（随机 token + sha256 入库）、`rotateRefreshToken`（事务：校验 → 吊销旧 → 建新）、`revokeRefreshToken`、`revokeAllUserRefreshTokens`（复用检测）
- [ ] 2.2 `authController`：`registerHandler`（201 { token, refreshToken, user } / 409 / 400）、`refreshHandler`（旋转 / 401 INVALID_REFRESH_TOKEN）、`logoutHandler`；`loginHandler` 响应加 `refreshToken`
- [ ] 2.3 `routes/auth.ts`：挂 `POST /register`、`POST /refresh`、`POST /logout`（均免认证）
- [ ] 2.4 `app.ts`：安装 express-rate-limit 依赖；login/register 限流器（10/15min、20/h），429 统一封装；auth 路由装配
- [ ] 2.5 api 测试（扩展 auth.test.ts + mock user.create/refreshToken）：register 201/409/400；login 返回 refreshToken；refresh 旋转 + 旧 token 复用 401 全家吊销 + 过期 401；logout 吊销；限流 429

## 3. Web

- [ ] 3.1 抽 `lib/http.ts` 公共客户端：`request<T>` + 401 单飞刷新（共享 in-flight promise）→ 重试一次 → 失败 clear+跳转；`ApiRequestError`
- [ ] 3.2 `movieApi/profileApi/sessionApi/behaviorApi/rentalsApi` 改用 http.ts（导出签名不变）；`authApi` 加 `register/refresh/logout`
- [ ] 3.3 `authStore`：persist 增 `refreshToken`；`setSession(token,user,refreshToken)` / `clear()` 清两者
- [ ] 3.4 `RegisterPage`（email/password/confirmPassword，共享 zod 校验 + 字段级 i18n 错误；成功 setSession 跳转）+ `/register` 路由 + 登录页入口链接；登出改调服务端 logout
- [ ] 3.5 i18n（zh-CN）：`register.*` key、`login.rateLimited` 等
- [ ] 3.6 web 测试：RegisterPage（渲染/校验/成功/409 文案）、http.ts 401→刷新→重试→失败登出（mock fetch）、authStore refreshToken 持久化、App 路由/守卫断言

## 4. 验证与脊柱文档

- [ ] 4.1 `API_CONTRACT.md`：§3.1 auth 端点（register/refresh/logout + 限流说明 + login 响应加 refreshToken）+ §4 新增 `EMAIL_ALREADY_EXISTS`(409)/`TOO_MANY_REQUESTS`(429)/`INVALID_REFRESH_TOKEN`(401)
- [ ] 4.2 `ARCHITECTURE.md`：认证流程/决策 +2 行（限流策略；refresh 旋转+吊销）
- [ ] 4.3 `PROJECT_STATUS.md`：In Progress FU-10；Next Steps 摘掉「登录限速；注册/建号流程；refresh token」挂账
- [ ] 4.4 验证：三包 typecheck + api/web/shared 测试全绿 + `openspec validate --all` + 真机验收 AC-1~AC-9
- [ ] 4.5 验收通过后归档：sync user-auth 主 spec（MODIFIED 2 + ADDED 3 需求）→ move change → validate → Trellis journal → 提交

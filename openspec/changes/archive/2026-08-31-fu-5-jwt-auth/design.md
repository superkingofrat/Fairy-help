## Context

See `proposal.md` and the approved requirements doc. The stub (`X-Dev-Role` / `Bearer dev-*`) lives in one middleware file; four web API clients hardcode role headers; ~30 api test call sites use stub headers; `JWT_SECRET` is already provisioned in local `.env` and `.env.example`. Web tests mock API clients and are unaffected by header changes.

## Goals / Non-Goals

**Goals:**

- One identity path: login → HS256 JWT → Bearer-only middleware → `res.locals` unchanged shape (`userId`, `role`), so every service/controller keeps working.
- Stub fully removed (no dual auth modes); test migration mechanized via a signing helper.
- Web: session store + guards so the "点进去就是 admin" problem is structurally gone.

**Non-Goals:**

- Registration/admin-issued accounts (deferred FU), refresh tokens, server-side revocation, password change/reset, rate limiting.

## Decisions

1. **`bcryptjs`（纯 JS）而非 `bcrypt`/`argon2`**  
   Why: §14 允许 bcrypt 系；Windows 免 node-gyp 编译坑；cost 10 足够 demo。  
   Alternative: argon2 —— 更现代但原生构建成本高。

2. **`jsonwebtoken` + HS256 + 12h 单 access token**  
   Why: 最小可用；无 refresh 的复杂度。过期重登可接受。  
   Alternative: access+refresh —— 本轮不做（挂 future）。

3. **凭证错误统一 401 同体**  
   Why: 防用户枚举。  
   Alternative: 区分「用户不存在/密码错」—— UX 略好但泄漏账号存在性。

4. **stub 彻底删除；测试用 `authHeader(role)` 签真 token**  
   Why: 双认证路径是长期负债；`.set("X-Dev-Role", x)` → `.set("Authorization", authHeader(x))` 可脚本化批量替换；测试密钥在测试文件内固定。  
   Alternative: `AUTH_MODE=stub` 环境开关 —— 生产漏配即裸奔的风险更大。

5. **`GET /api/auth/me` 支撑会话恢复**  
   Why: 刷新页面后前端只有 token，需要还原 user（角色导航依赖 role）。

6. **前端 token 存 localStorage（zustand persist）**  
   Why: 简单、刷新即恢复；React 默认转义 + 无 dangerouslySetInnerHTML 缓解 XSS 面。  
   Alternative: httpOnly cookie —— 防 XSS 更优但要处理 CSRF 与跨端口联调，挂 future。

7. **种子固定开发密码进 seed.ts 并注释 demo-only**  
   Why: 仅登录路线下账号必须可登录；两把密码 `user123456` / `admin123456` 文档化在需求与 seed 注释。  
   Trade-off: 密码常量随仓库提交 —— 上线前必须改密（挂 risk）。

8. **启动校验放 `index.ts`（§12）**  
   Why: `createApp` 是纯函数（测试复用），启动入口做一次性 env 断言最合适。

## Risks / Trade-offs

- [固定开发密码随仓库提交] → demo-only；上线前改密或实施注册/建号 FU。
- [localStorage XSS 面] → 当前模板无危险 HTML 注入点；httpOnly cookie 挂 future。
- [登录无限速] → 暴力尝试可行；demo 接受，rate limit 挂 future。
- [30+ 测试头迁移] → 批量替换 + 助手函数，一次性成本。

## Migration Plan

- 迁移 `add_user_password_hash` → 重新 `db:seed` 写入哈希 → 部署 API 与 web（无顺序依赖，旧前端 stub 头在新 API 下全部 401，需同步发）。
- Rollback: revert 提交即可（stub 恢复）；passwordHash 列无害保留。

## Open Questions

None blocking.

## Affected Modules

- `Fairy/packages/database`：User.passwordHash + 迁移 + seed
- `Fairy/packages/shared`：schemas/authSchemas.ts（loginSchema/authUserSchema）
- `Fairy/apps/api`：routes/auth.ts、controllers/authController.ts、middleware/auth.ts 重写、index.ts 校验、package.json、全部测试
- `Fairy/apps/web`：stores/authStore.ts、lib/authApi.ts、4 个 client、pages 或 components/login、App.tsx 守卫/导航、i18n、`__tests__/`
- `API_CONTRACT.md`、`ARCHITECTURE.md`、`PROJECT_STATUS.md`、`Fairy/apps/api/.env.example`

## Next Step

- User reviews artifacts, then `/opsx:apply`

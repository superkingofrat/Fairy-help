## Context

现有认证仅「登录 + me」：`apps/api/src/routes/auth.ts` 两个端点，`authService.authenticate`（bcrypt 校验，错误统一返回 null 防枚举）+ `signToken`（HS256, 12h）；无注册、无限流、无 refresh。Web 侧 `LoginPage` + `authStore`（persist `fairy-auth`）存 token/user；6 个 lib 各复制一份 `request<T>`，401 均为 `clear()` + 硬跳 `/login`。见 proposal.md「Why」——本设计覆盖注册、限流与 refresh token 怎么落地。

## Goals / Non-Goals

**Goals**

- 自助注册闭环（注册即登录），对既有 login/me 语义与防枚举原则零破坏。
- 登录/注册按 IP 限流，429 走统一 `{ code, data, msg }` 封装。
- refresh token 可服务端吊销、可旋转，access 过期后 web 静默续期。
- 前端 401 自动续期用单飞刷新，消除 6 处重复 `request<T>`。

**Non-Goals**

- 不做密码找回/重置、邮箱验证、OAuth/第三方登录、多设备管理 UI、主动续期定时器、admin 开放注册。

## Decisions

### D1：注册只建 User，不自动建 Profile，role 恒 `user`

`POST /api/auth/register` 校验 `registerSchema`（email + password 6~72），bcrypt(cost 10) 建用户。Profile 是 1:1 可选关联（dev-admin 无 Profile 是既有合法状态），注册不建 Profile，仍走 FU-1 的 admin 补建流程。**不允许注册 admin**（admin 只经 seed）。email 唯一冲突 → 409 `EMAIL_ALREADY_EXISTS`；注册成功返回 201 `{ token, refreshToken, user }`（与 login 同形状，注册即登录，避免二次调用）。

**取舍**：注册 409 会暴露「邮箱是否已注册」——这是注册 UX 的常规取舍，接受；登录路径保持统一 401 防枚举不变。

### D2：RefreshToken 落库存哈希，随机不透明 token，30d 过期

Prisma 模型：`tokenHash @unique`（sha256(随机 48B base64url)）、`userId` FK（索引）、`expiresAt`、`revokedAt?`、`replacedByTokenId?`（自关联，记录旋转链）、`createdAt`。明文 token 只在签发时返回一次；DB 只存哈希——泄库无法冒用（与密码只存 bcrypt 同思路）。

**备选**：无状态 refresh JWT（免表但无法吊销、无法检测旋转复用）。选 DB 落库：项目数据一致性优先（AGENTS §0），可服务端吊销，符合「闭环」诉求。

### D3：refresh 旋转 + 复用检测全家吊销；logout 吊销当前 token

- `POST /api/auth/refresh`：按 `tokenHash` 查行 → 不存在/已吊销/已过期 → 401 `INVALID_REFRESH_TOKEN`；有效则在同一事务内：旧行置 `revokedAt` + `replacedByTokenId` = 新行 id，插入新行，签发新 access(12h) + 新 refresh(30d)。
- **复用检测**：被旋转/吊销的 token 再次出现 → 401，并把该用户**全部** refresh token 置 `revokedAt`（强制重登，压缩盗用窗口）。
- `POST /api/auth/logout`：body `{ refreshToken }`（以 refresh token 自证，无需 access），吊销该行。access token 自然过期。
- 过期 token 行保留（审计），不主动清理（本期无后台任务）。

### D4：限流用 express-rate-limit，限流器在 `createApp()` 内创建

login：`10 次 / 15 分钟 / IP`；register：`20 次 / 小时 / IP`。`createApp()` 内 `rateLimit({ ... handler: (req,res) => res.status(429).json({ code:"TOO_MANY_REQUESTS", data:null, msg:"尝试过于频繁，请稍后再试" }) })`——每个 app 实例独立计数，测试隔离。生产反代需 `app.set("trust proxy", ...)`（契约文档标注，本地开发不需要）。

**取舍**：按 IP 而非 IP+账号（IP+账号更精准但需自研存储）；默认阈值用常量，需要时再抽 env。

### D5：前端抽公共 `lib/http.ts`，401 单飞刷新 + 重试一次

`request<T>(path, init)`：从 authStore 取 token 带 `Authorization`；解析 `{ code, data, msg }`，`code !== "OK"` 抛 `ApiRequestError`；**401 时**：若存在 refreshToken → 单飞刷新（模块级共享 in-flight Promise，并发 401 只刷一次）→ 成功更新 store 后重试原请求一次 → 刷新失败才 `clear()` + `window.location.assign("/login")`；无 refreshToken → 直接登出。`movieApi/profileApi/sessionApi/behaviorApi/rentalsApi` 改为调用 `http.ts`（**导出签名不变**，既有测试不受影响）；`chatApi`（SSE 流式）保持现状：流开始前若 401 直接登出（流中途刷新语义复杂，明确取舍）。

## Risks / Trade-offs

- **[localStorage 存 refreshToken]** XSS 可窃取 → 与 access token 同处存放，本期接受（SPA 无 HttpOnly 承载方案）；文档标注，后续可迁到更安全存储。
- **[409 暴露邮箱存在性]** 注册场景常规取舍，接受。
- **[单飞刷新期间请求串行等待]** 并发 401 会等同一个刷新 Promise → 有界延迟，换取不重复刷新；刷新网络失败时统一登出，不重试刷新本身（防风暴）。
- **[按 IP 限流误伤 NAT 用户]** 简单可靠但同出口 IP 共享额度 → 阈值放宽（10/15min），后续可升级 IP+账号。

## Migration Plan

- 开发：`prisma migrate dev --name add_refresh_token_table`（纯新增表 + 索引，无数据迁移）；`pnpm --filter=@fairy/database generate`。
- 生产：`prisma migrate deploy`。
- 回滚：移除 RefreshToken 表 + 回退 API/前端；access/refresh 均为新增响应字段，旧客户端不受影响。

## Open Questions

无——密码找回/邮箱验证/多设备 UI 属明确 out of scope，可安全后置。

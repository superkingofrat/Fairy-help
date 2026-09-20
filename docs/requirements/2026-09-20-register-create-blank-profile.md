# 需求：注册即建空白画像

**Date:** 2026-09-20（合伙人审核提出，用户批准后经 Trellis 轨交付）
**Status:** implemented（2026-09-20，Trellis 轨；验收见 PROJECT_STATUS.md）
**轨道：** Trellis（单 api 端点内联行为变更；无新端点、无 DB schema 变更、不改 `API_CONTRACT.md` 公共契约）
**前置：** FU-10 账号体系闭环（注册/限流/refresh token）已交付

## 背景 / 问题

当前 `POST /api/auth/register` 成功后只返回 `{ token, refreshToken, user }`，不建 `Profile`。
- `Profile.userId` 是 `Memory.profileId` 的外键 → 无画像 → 记忆落不进库（`stateLoop.ts` 静默降级为空数组）
- `recommendMovieTool` 读 `profile.likeGenres` 为空 → 推荐无个性化排序
- 前端 `lib/profileApi` 无本人读/编辑端点，用户自助引导入口为零

结果：自助注册的用户，永远用不上「有记忆、强个性化」的核心卖点。

## 目标

注册成功后自动为该用户建一张空白 `Profile`：
- `name` = 邮箱前缀（如 `user@fairy.local` → `user`），其余字段取默认空值
- 注册响应不变（仍返回 `{ token, refreshToken, user }`，不额外暴露 profile）
- 无 Profile 异常分支被覆盖（注册即建，不存在缺失）

## 范围

- `apps/api/src/services/authService.ts`：注册成功路径增加 `profileService.create(user.id, ...)`
- `apps/api/src/services/profileService.ts`：`create` 函数已在 FU-1 交付，直接复用
- 测试：authService 注册用例断言 profile 创建被调用；auth routes 注册成功响应形状不变

## 非目标

- 不新增公共 API 端点或管理页入口
- 不改变 `POST /api/auth/register` 请求/响应契约（`API_CONTRACT.md` §3.0 不变）
- 不做「注册即强制引导补全画像」弹窗（留后续 UI 需求）
- 不影响 FU-10 的限流/refresh token 行为

## 受影响模块

| 模块 | 变更 |
|---|---|
| `apps/api/src/services/authService.ts` | 注册成功回调建空白 Profile |
| `apps/api/src/__tests__/auth.test.ts` | 注册用例补 profile 创建断言 |
| 文档 | 无（无公共契约变更） |

## 验收标准

- **AC-1**：新注册邮箱 `test@fairy.local` → 响应 `{ token, refreshToken, user }` 不变；`Profile` 存在且 `userId == user.id`、`name == "test"`
- **AC-2**：重复注册（邮箱已存在）→ 409 `EMAIL_ALREADY_EXISTS`，不建新 Profile
- **AC-3**：ProfileService.create 抛错（极端情况）→ 注册仍 201（profile 创建失败不影响注册流程，仅记 warn 日志）

## 待决问题

1. `name` 取邮箱前缀：是否要加去特殊字符（如 `user+tag@fairy.local` → `user`）？默认不做，直接 `email.split("@")[0]`。
2. 其余字段（`styleTags`/`likeGenres`/`avoidFood`/`dietPreference`/`travelStyle`）默认全空数组/`null`。

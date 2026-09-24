# 演示用户种子数据：绝区零角色 → 46 名 Fairy 用户/画像/记忆

## Goal

Trellis 轨小功能：docs/requirements/2026-09-24-seed-persona-users.md（approved）。新增 packages/database/prisma/seedData/personas.ts 转写素材表 46 条 + 扩 seed.ts 幂等落库（user→profile→memories×3）。不改 schema、不生成迁移、不动契约。AC-1~AC-5 见需求文档。

## Requirements

- **数据文件** `packages/database/prisma/seedData/personas.ts`：导出 46 条 persona 记录，字段 `{ slug, name, styleTags, likeGenres, avoidFood, dietPreference, travelStyle, occupation, memories: { preference, fact, intent } }`，由素材表《绝区零角色用户种子素材.xlsx》（repo 根，QA 已过：validate/audit/scan 零问题、46 邮箱唯一、likeGenres 全部落在片单 9 类内）逐字转写；文件头注释记录来源（bwiki 官方介绍/详细情报，2026-09-24 抓取）与免责（性格/职业整理自官方文本；饮食/旅行/记忆为演示填充、非官方设定、可改写）。
- **seed 编排** `packages/database/prisma/seed.ts`：`bcrypt.hashSync(DEV_USER_PASSWORD, 10)` 计算一次、46 条复用；user 按 email upsert → profile 按 userId upsert（数组非空、可空字段 null，与 `createProfileSchema`/`profileWriteFieldsSchema` 口径一致）→ memories 按 (profileId, kind, content) 先查后插，已存在跳过；现有两个 dev 账号与 movies 数据行为不变。
- **已批准定稿（负责人 2026-09-24 批准，按推荐默认）**：① memories 去重 = (profileId, kind, content) 先查后插；② user 按 email upsert、uuid 由库生成（素材表 P-01~P-46 编号仅工作稿索引，不入库）；③ 演示口令沿用 `user123456`，不为 persona 单设密码；④ 趣味演示值（丽娜「自制作品（试毒警告）」等）保留并在数据文件注释标明非官方设定；⑤ likeGenres 复查口径（扩片单类型后 persona 偏好需同步复查）写入数据文件注释。
- **不写** `memories.embedding` 列（Prisma client 不读写 vector 列，向量写入/回填走既有 raw SQL 链路与 FU-16 回填流程）；不改 schema、不生成迁移；不做 admin 导入 UI。

## Acceptance Criteria

- [x] AC-1：`pnpm --filter=@fairy/database db:seed` 成功退出；users 48（现有 2 + 46）、profiles 47（现有 1 + 46）、memories 138 且 kind 分布 PREFERENCE/FACT/INTENT 各 46
- [x] AC-2：任一 persona 邮箱（如 `soldier11@fairy.local`）+ `user123456` 经 `POST /api/auth/login` 登录成功；profile 各字段与素材表一致（数组非空、可空字段 null 或字符串、无空串）
- [x] AC-3：幂等——连续执行 seed 两次，四项计数与 AC-1 相同，无重复 user/profile/memory 行
- [x] AC-4：`migrate:status` 无待应用迁移、schema 无 diff；`NODE_ENV=production pnpm --filter=@fairy/database db:seed` 非零退出且不写库（既有 seedGuard 继续覆盖）
- [x] AC-5：`pnpm --filter=@fairy/database typecheck` 与 `lint` 通过；`pnpm --filter=@fairy/database test` 通过

## Notes

- 需求文档：docs/requirements/2026-09-24-seed-persona-users.md（5 项待决问题均已按推荐默认定稿，见 Requirements 末节）
- 入口守卫现状：`prisma/seed.ts` 模块加载即 `NODE_ENV=production → exit(1)`；personas.ts 由 seed.ts 直接相对路径 import
- 验收环境：§15.4 checklist——`DATABASE_URL` 两处（packages/database/.env 与 apps/api/.env）一致；跑 seed 前不重启 api 亦可（seed 独立进程），但 AC-2 登录验收需 api dev 在跑

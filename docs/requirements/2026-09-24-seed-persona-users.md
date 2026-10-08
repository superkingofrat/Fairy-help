# 需求：演示用户种子数据（绝区零角色 → 46 名 Fairy 用户/画像/记忆）

> 状态：**implemented**（2026-09-24 负责人批准 → Trellis task `09-24-seed-persona-users` → 交付验收通过；实现与验收记录见 PROJECT_STATUS.md Completed Modules 2026-09-24 条目）· 日期：2026-09-24 · 负责人：Flores
> 轨道：Trellis（仅 `packages/database` 的 seed 数据 + 编排；不改 schema、不生成迁移、不动 `API_CONTRACT.md` 契约形状）
> 前置：素材表《绝区零角色用户种子素材.xlsx》已产出（46 名角色 × User/Profile/Memory 字段，QA 全过）；录入路径已调研并确认走 `seed.ts`

## 背景 / 问题

负责人的原始诉求是「收集人物性格与职业之类，作为后续输入当作用户的素材」。本轮已交付素材表：从 bwiki 抓取 46 名已实装 S 级角色的「官方介绍/详细情报」，整理为「用户种子数据（46）× 人物档案（46）× 记忆种子（138）——说明与导入」四张表，字段逐列对齐 `users` / `profiles` / `memories` 三张表与 `seed.ts` 既有约定（bcrypt 开发密码、likeGenres 取自现有片单类型、数组字段顿号分隔、sessionId 空 = 管理/系统录入）。来源：性格/职业整理自官方文本（2026-09-24 抓取）；饮食/旅行/记忆为演示用示例填充（表内已注明非官方设定）。

问题：Excel 是工作稿，还不是库里的数据。「录入系统」需要落点，三条候选路径已调研：

- **另写一个独立录入项目**：否决。项目已有单条录入通道（`POST /api/auth/register` 建 user、`POST /api/profiles` admin 建画像、`PATCH` 改画像），新项目等于重复造轮子且要重抄 `@fairy/shared` 校验，违反 AGENTS「优先复用现有约定」
- **直接让 AI 往库里写 INSERT**：否决。不可复现、绕过 seed 守卫与哈希约定、库与代码漂移、评审盲区
- **扩 `packages/database/prisma/seed.ts`**：选定。**这就是项目为演示数据准备的官方入口**——已有 bcrypt 哈希注入、upsert 幂等、`NODE_ENV=production` 拒绝守卫；任何人重建环境跑一次 `db:seed` 即恢复，随 git 评审与回滚

本需求将素材表转成仓库内的结构化种子数据并接入 seed 编排。

## 目标

- 46 名角色的 user / profile / 每条 3 类共 138 条 memory 写入 `seed.ts`，字段口径与素材表及 schema 校验（`createProfileSchema` / `profileWriteFieldsSchema`）一致
- 幂等：重复执行 seed 数据不翻倍、不残留；users 固定 uuid 或按 email upsert，profiles 按 userId upsert，memories 去重后 create
- 生产环境守卫保持现有行为（`NODE_ENV=production` 拒绝执行）
- 数据可溯源：种子数据文件头注释写明来源（bwiki 官方介绍/详细情报，抓取日期）与免责（饮食/旅行/记忆为演示填充，非官方设定，可改写）

## 范围

- `packages/database/prisma/seedData/personas.ts`（新增）：46 条 persona 数据结构（email slug / name / styleTags / likeGenres / avoidFood / dietPreference / travelStyle / 职业参考 / 记忆三条），从素材表结构化转写，附来源与免责注释
- `packages/database/prisma/seed.ts`：编排 persona 数据（bcrypt hash 只算一次并复用；user → profile → memories 顺序落库；memories 去重判重），保留现有 movies 与两个 dev 账号
- `docs/requirements/README.md` 索引 + `PROJECT_STATUS.md` 登记（Next Steps → 批准后 In Progress → 交付后 Completed Modules）

## 非目标

- 不改 `schema.prisma`、不生成迁移、不改任何 API 契约或前端页面
- 不做 admin 导入 UI / Excel 上传解析（若后续成为高频运营需求，另出需求走 §15.1）
- 不写 `memories.embedding` 列（Prisma client 不读写 vector 列，向量写入/回填走既有 raw SQL 链路与 FU-16 回填流程）
- 不补 A 级角色、不改 `POST /api/auth/register` / `POST /api/profiles` 既有接口
- 不把演示偏好当官方设定对外承诺（素材表免责口径保留在数据文件注释中）

## 受影响模块

| 模块 | 变更 |
|---|---|
| `packages/database/prisma/seedData/personas.ts` | 新增种子数据（含来源/免责注释） |
| `packages/database/prisma/seed.ts` | persona 落库编排（幂等 upsert + 去重 memory create） |
| `docs/requirements/README.md` | 索引登记 |
| `PROJECT_STATUS.md` | Next Steps/Completed Modules 登记 |
| `ARCHITECTURE.md` / `API_CONTRACT.md` | **无变更**（seed 非契约、无新端点/负载） |

## 验收标准

- **AC-1**：`pnpm --filter=@fairy/database db:seed` 成功退出；users 增至 48（现有 2 + 46）、profiles 增至 47（现有 1 + 46）、memories 138 条且 kind 分布 PREFERENCE/FACT/INTENT 各 46
- **AC-2**：任一 persona 邮箱（如 `soldier11@fairy.local`）+ `user123456` 经 `POST /api/auth/login` 登录成功；其 profile 各字段与素材表一致（styleTags/likeGenres/avoidFood 数组非空、dietPreference/travelStyle 为 null 或字符串、无空串）
- **AC-3**：幂等——连续执行 seed 两次，四项计数与 AC-1 相同，无重复 user/profile、无重复 memory 行
- **AC-4**：`migrate:status` 无待应用迁移、schema 无 diff；`NODE_ENV=production pnpm --filter=@fairy/database db:seed` 以非零码退出且不写库
- **AC-5**：`pnpm --filter=@fairy/database typecheck` 与 `lint` 通过；`pnpm --filter=@fairy/database test` 通过（无既有测试则 passWithNoTests）

## 待决问题

1. **memories 去重键**：建议按 (profileId, kind, content) 先查后插（或依赖唯一约束），内容逐字相同即跳过。是否接受 46×3 次 findFirst 的 seed 开销（一次性、可忽略）？
2. **user 落库方式**：建议按 `email` upsert（uuid 由库生成还是沿用素材表占位编号 P-01…P-46？）——倾向 uuid 生成，素材表的种子编号仅作工作稿索引。
3. **演示口令**：沿用 `user123456`（与两个 dev 账号同一约定，登录页/讲义已默认此密码）。是否要为 persona 单设密码？
4. **likeGenres 语义**：现取门店片单 9 类之一；若后续扩片单类型，persona 偏好需同步复查——是否在数据文件注释中写下复查口径？
5. **趣味值保留**：素材表中少量演示趣味值（如丽娜 avoidFood「自制作品（试毒警告）」、悠真「糖包全被苍角拿走」）建议保留以提升演示真实感，注释标明非官方设定。可否？

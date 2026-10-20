# 真机验收记录：FU-20 行程规划同行人画像

- 日期：2026-10-10 · 环境：api :3000（`tsx watch`，dev 库 Neon，DeepSeek 真实 LLM）
- 方式：API 直连（登录 → `POST /api/chat` SSE）+ `behavior_logs` 落库断言
- 账号：`user@fairy.local`（role=agent，行程规划门禁放行；本人画像 `travelStyle` 为 null——dev 库已按 seed 基线清理，正好隔离「同行人行」）

## 结果

| 断言 | 结果 | 证据 |
| --- | --- | --- |
| AC-1 同行人画像注入 LLM 上下文 | ✅ | 单测逐字断言注入串（不依赖真实 LLM）；真机 `TRIP_PLANNED` payload 带 `companionName:"莱卡恩"` + `companionUserId:"794861b0-0699-4807-a660-6fe7e78852f0"`（lycaon@fairy.local 的 Profile 行） |
| AC-2 行程/回复可观察画像特征 | ✅ | 回复「泉州一日行程已经帮你和莱卡恩安排好啦」，行程含「闽南菜正餐（『宋小谨』或『老泉州私房菜』**包间**）」与「住西街附近的**精品酒店**（泉州华侨大厦或西街民宿**升级房型**）」——与莱卡恩 `dietPreference="料理标准极高，餐具必须对齐"`、`styleTags=["优雅","洁癖","全能"]` 一致 |
| AC-3 非注册人名行为与改动前一致 | ✅ | 「我周末要和小明出去泉州玩」→ `TRIP_PLANNED` payload **无** companion 键；行程为街边小摊（海蛎煎小摊/石花膏）且无住宿步骤，与无同行人基线同类 |
| AC-4 无同行人消息不回归 | ✅ | 「帮我规划周末去杭州玩」→ 正常两日杭州行程（断桥残雪→灵隐寺→龙井村…），prompt 与日志负载逐字不变（单测锁定） |
| AC-5 本人与同行人两行归属化共存 | ✅ | 单测断言 `用户画像旅行风格：…。` + `同行人莱卡恩的偏好：…。` 两行顺序固定；真机账号本人 `travelStyle` 为 null，仅同行人行（符合预期） |
| AC-6 契约/schema 不变 | ✅ | SSE `trip` 事件 shape、`Trip` 落库字段、`GET /api/trips` 行为未动；零迁移 |
| AC-7 api 包测试/typecheck/lint | ✅ | 414 通过 / 1 跳过（真实库并发用例按 `TEST_DATABASE_URL` 门控跳过）+ typecheck + lint 全绿 |
| AC-8 无密钥/堆栈泄露 | ✅ | 全部回复为自然中文；DeepSeek 偶发草稿失败时走既有友好降级（「泉州这两天的行程我这边没能顺利排出来…」），无堆栈、无 provider 负载 |

## 备注

- 真机多轮采样中 DeepSeek 偶发返回非法 JSON 草稿（`TRIP_DRAFT_FAILED`，3 次重试后降级追问）——FU-13 既有行为，非本次引入；降级文案友好、不落库、不发 `trip` 事件。
- `format:check` 仓库级失败（169 个文件）系 `core.autocrlf=true` 检出 CRLF 的环境性问题，与本次改动无关；本次新增/改动行与 prettier 输出逐字一致。
- AC-8 的第二条登录路径（persona 账号如 `soldier11@fairy.local`）**未覆盖**：persona 种子账号 role=user，`dispatch` 的 trip 分支按 `role ∈ {admin, agent}` 门禁直接婉拒，不进入 `planTripTool`——这是 FU-13 已生效的身份化门禁行为，非本次回归。如需 persona 路径真机验收，须由负责人把对应账号提为 agent 角色。

# FU-20 行程规划同行人画像（对话行程纳入同行者人设）

- 状态：implemented（2026-10-10 交付；实现、测试与真机验收记录见 PROJECT_STATUS.md Completed Modules）
- 日期：2026-10-10
- 负责人：Flores
- 前置：FU-13 [2026-09-01-travel-planning.md](./2026-09-01-travel-planning.md) 已交付（`planTripTool` 现仅注入登录用户本人 `travelStyle`）；FU-19 二期已交付（REST 端点 + 地图 + 回放）；46 名 persona 种子数据已在 dev 库（`feat/seed-persona-users` 分支已合入当前工作分支）

## 背景 / 问题

负责人真机测试发现：发送「我周末要和莱卡恩出去泉州玩」，agent **直接规划了行程，没有考虑莱卡恩的角色画像与性格**，不符合预期。

根因（代码事实）：`apps/api/src/tools/planTripTool.ts` 的 `draftTrip` 只把**登录用户本人**的 `travelStyle` 注入 LLM prompt（`用户画像旅行风格：${travelStyle}。`，planTripTool.ts:86-89）。链路里没有「同行人」概念：不从消息文本识别人名、不查同行人画像、不把同行人偏好纳入生成上下文。因此「和谁一起去」这个信息被完全丢弃。

这不是实现缺陷：FU-13 需求目标 4 写的是「复用画像 `travelStyle` 个性化行程风格」（指登录用户本人），非目标明确「不新增行程推荐画像字段（仅读取现有 `travelStyle`）」，AC-1~AC-8 均未涉及同行人。现状符合已批准需求，属**新增能力**，按 AGENTS §15.1 走完整门禁（Trellis 轨：单 app、无公共契约变更、无 schema 变更）。

演示数据侧证据：莱卡恩（`lycaon@fairy.local`）画像含 `travelStyle="服务型行程，先订三套备选方案"`、`styleTags=["优雅","洁癖","全能"]`、`dietPreference="料理标准极高，餐具必须对齐"`、`avoidFood=[]`，另有 preference/fact/intent 三条记忆——这些信息目前完全没有进入行程生成。

## 目标

1. `plan_trip` 请求中识别出同行人（已注册 persona）时，把其画像纳入行程生成上下文，使行程风格贴合同行人设。
2. 登录用户本人的 `travelStyle` 注入行为不回归（无同行人消息与改动前逐字一致）。
3. 同行人解析失败（非注册人名、无人名、匹配不到）时静默降级为现状：不报错、不追问、不阻塞行程生成。
4. 零公共契约变更：SSE `trip` 事件形状、`Trip` 行形状、REST 端点行为均不变；零 schema 迁移。

## 范围

- **后端（apps/api，唯一改动包）**：
  - 新增同行人解析：从（已消毒的）消息文本中提取人名 → 按 `Profile.name` 精确匹配（如「莱卡恩」→ `lycaon@fairy.local` 的 Profile）→ 读取画像字段。人名匹配失败即返回 null，不做模糊匹配（防止把无关人名误判为 persona 而注入错误画像）。
  - `planTripTool.draftTrip` 扩展：在现有「用户画像旅行风格」行之外，追加同行人画像行（字段范围见待决问题 1），并约定与用户本人偏好并存时的呈现方式（待决问题 2）。
  - 行为日志 `TRIP_PLANNED` payload 增加同行人标识（slug 或 userId，仅 payload 内，无契约影响），便于审计「这次行程考虑了谁」。
  - 测试：同行人解析单测（命中/未命中/多重名/无人名）、prompt 注入内容断言、降级路径（非注册人名行为与改动前一致）、回归（无同行人消息不注入新行）。
- **文档**：`ARCHITECTURE.md` §8 决策行、`docs/tools.md` planTripTool 条目、`PROJECT_STATUS.md`；`API_CONTRACT.md` **不变**（无契约变更，仅内部行为）。

## 非目标

- 不解析非注册人名（如「和我女朋友出去」）：不当成 persona，静默忽略，维持现状行为。
- 不为同行人落库新字段（`Trip` 不加 companion 列）：同行人只作为生成上下文，不改变 Trip 模型；如需「行程记录了和谁去」另立需求。
- REST `POST /api/trips` 不支持同行人：该端点入参只有 destination/days，无自由文本可解析；如未来要支持，另立需求加参数。
- 不改 `intentClassifier` 的 `plan_trip` 识别逻辑（「和X去Y玩」已被现有规则/LLM 正确识别为 plan_trip，实测通过）。
- 不做多同行人偏好协商/权重，不做同行人记忆注入。

## 受影响模块

- `apps/api`：`tools/planTripTool.ts`（prompt 扩展 + 同行人解析接线）、`services/profileService.ts`（新增按 name 查 Profile 的查询函数，或就近放在 planTripTool 内的私有 helper，按实现评审定）、`services/behaviorLogService.ts`（payload 字段，无枚举变更需要——TRIP_PLANNED 已存在）
- 文档：`ARCHITECTURE.md`、`docs/tools.md`、`PROJECT_STATUS.md`
- **不涉及**：`packages/shared`、`packages/database`、`apps/web`

## 验收标准

- AC-1：发送「我周末要和莱卡恩出去泉州玩」→ `draftTrip` 的 LLM messages 中包含莱卡恩画像行（单测直接断言注入内容，不依赖真实 LLM）。
- AC-2：真机（真实 DeepSeek）：同一句话两次请求，行程或回复中可观察到画像特征体现（如出现备选方案、餐具/就餐安排、礼仪/优雅相关表述），且与不带同行人的基线行程有可观察差异。
- AC-3：非注册人名（如「我周末要和我女朋友去泉州玩」）→ 行为与改动前一致：无注入、无追问、行程照常生成（单测 + 真机各一）。
- AC-4：无同行人消息（如「帮我规划去杭州的行程」）→ 仍只注入登录用户本人 `travelStyle`，prompt 与改动前逐字一致（回归）。
- AC-5：登录用户本人与同行人 `travelStyle` 同时存在时，两者都注入且归属标注清晰，不互相覆盖。
- AC-6：SSE `trip` 事件 shape、`Trip` 落库字段、`GET /api/trips` 行为不变（无契约/schema 变更，typecheck + 既有 api 测试全绿佐证）。
- AC-7：api 包测试全绿 + typecheck + lint。
- AC-8：真机覆盖两条登录路径：persona 账号（如 `soldier11@fairy.local`）与 dev agent 账号（`user@fairy.local`）。

## 决策记录（2026-10-10 批准时定稿）

1. **注入字段**：`travelStyle` + `styleTags` + `dietPreference` + `avoidFood`；**不注入** preference/fact/intent 记忆（记忆属另一主题，注入会放大 prompt 与隐私面）。
2. **冲突处理**：不做硬优先级，两行都注入并标注归属（「同行人莱卡恩的偏好：…」/「你的旅行风格：…」），由 LLM 协调。
3. **人名匹配**：`Profile.name` 精确匹配 + 仅取消息中出现的人名；表当前 49 行无需索引。**不做**模糊/别名匹配（防误注入他人画像）。
4. **行为日志**：`TRIP_PLANNED` payload 记录同行人标识（实现采用 `companionName` + `companionUserId`，仅 payload，无契约影响），便于审计。
5. **轨道**：**Trellis 轨**（单 app、无契约变更、无 schema 变更）——Trellis task → `task.py start` → 实现 → 真机验收。

## 实现与验收记录（2026-10-10）

- 实现：`profileService.listCompanionCandidates(excludeUserId)`（除本人外全部画像的 `CompanionCandidate`，一次查询、不 join `User`）；`planTripTool` 消毒一次后 `findCompanion`（`Profile.name` 精确子串，取最先提到的一个）→ `draftTrip` 追加 `同行人X的偏好：…` 行（只拼非空字段，本人 `travelStyle` 行在前）；候选查询失败 `.catch(() => [])` 降级；`TRIP_PLANNED` payload 增记 `companionName`/`companionUserId`（未命中不新增键）。
- 测试：`planTripTool.test.ts` 新增 7 例（命中注入逐字断言、多重名取最先、未注册人名、无候选时 prompt/日志负载逐字不变、仅人名无字段、候选查询失败仍出行、空消息跳过查询），16 例全绿；api 包 414 通过 / 1 跳过，typecheck 与 lint 通过。
- 真机（dev agent 账号 `user@fairy.local`，真实 DeepSeek）：同一句「我周末要和莱卡恩出去泉州玩」→ `TRIP_PLANNED` payload 带 `companionName:"莱卡恩"` 与莱卡恩 userId，回复明确「帮你和莱卡恩安排好啦」，行程选包间闽南菜正餐与精品酒店升级房型（对照：未注册人名「小明」不注入，行程为街边小摊且无住宿步骤；无同行人消息的杭州基线行程正常）。
- 决策 4 落地字段由 `companionSlug` 调整为 `companionName` + `companionUserId`（实现评审定稿：userId 可追溯，name 便于人读）。
- 文档：`Fairy/docs/prompts.md` 补 `TRIP_SYSTEM_PROMPT` 逐字快照（§4 行程规划节）——该提示词自 FU-13 引入、本次又改规则行，但快照文档一直只有 agent 链路三个提示词（既有漂移）；已补调用链 `plan_trip` 分支、公共约束表适用范围说明与变更规则测试清单，快照与源码经 node 脚本逐字节校验一致（429 字符）。

## 附：与本需求相关的 dev 库数据残留（非产品缺陷，建议验收前清理）

负责人测试用的两个 dev 账号画像被历史验收污染：`user@fairy.local` 的 `travelStyle="13"`、`admin@fairy.local` 的 `travelStyle="123"`、`likeGenres=["123"]`。这会导致「用户本人 travelStyle 注入」注入的是垃圾值（prompt 里出现「用户画像旅行风格：13。」），干扰本需求的对照验收。seed 的 update 分支不重置 `travelStyle`（仅 create 分支写 null），重跑 `db:seed` 不会清掉；需显式置回。清理动作属 dev 数据修复，建议在本需求实现前完成，以便 AC-4/AC-5 的基线干净。

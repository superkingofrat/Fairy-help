### 背景

负责人真机测试发现：发送「我周末要和莱卡恩出去泉州玩」，agent 直接规划了行程，没有考虑莱卡恩的角色画像与性格。根因定位在 `apps/api/src/tools/planTripTool.ts` 的 `draftTrip`：只把登录用户本人的 `travelStyle` 注入 LLM prompt，链路里没有「同行人」概念。

对照 FU-13 需求文档（目标 4 写的是「复用画像 travelStyle 个性化行程风格」指本人；非目标明确「不新增行程推荐画像字段（仅读取现有 travelStyle）」；AC-1~AC-8 均无同行人要求），确认现状符合已批准需求，属**新增能力**而非实现缺陷——因此没有直接改代码，而是按 AGENTS §15.1 走 Trellis 轨门禁：写需求文档 → 负责人批准 → 建 Trellis task → `task.py start` → 实现 → 验收。

### Main Changes

- `apps/api/src/services/profileService.ts`：新增 `CompanionCandidate` 类型与 `listCompanionCandidates(excludeUserId)`——除登录用户本人外的全部画像（userId/name/travelStyle/styleTags/dietPreference/avoidFood），一次查询、不 join `User`（避免邮箱等身份信息进行程生成链路）。
- `apps/api/src/tools/planTripTool.ts`：消毒从 `draftTrip` 内部上移到 `planTripTool`（只做一次）；`findCompanion` 按 `Profile.name` 在已消毒消息里精确子串匹配，取**最先提到**的一个；`buildCompanionLine` 只拼非空字段生成「同行人X的偏好：旅行风格「…」；风格标签「…」；饮食偏好「…」；忌口「…」。」行；与本人 `travelStyle` 行**归属化两行共存**（本人行在前），未命中/候选查询失败（`.catch(() => [])`）/画像全空三种情况降级为无同行人，prompt 与改动前逐字一致。
- `TRIP_PLANNED` 行为日志 payload 增记 `companionName`/`companionUserId`（未命中时不新增键，负载逐字兼容）——这是真机验收里唯一能确定性证明「考虑了谁」的观测点。
- `TRIP_SYSTEM_PROMPT` 规则行同步改为「参考用户画像的旅行风格与同行人偏好（如有），让行程贴合」。

### Testing

- `planTripTool.test.ts` +7 例：命中注入逐字断言（含两行顺序）、多重名取最先提到、未注册人名不注入、无候选时 prompt 与日志负载逐字不变、仅人名无字段不产行、候选查询失败仍正常出行、空消息跳过候选查询。
- api 包 414 通过 / 1 跳过（真实库并发用例按 `TEST_DATABASE_URL` 门控跳过）+ typecheck + lint 全绿。
- 真机（`user@fairy.local`，真实 DeepSeek）：莱卡恩原话 → `TRIP_PLANNED` payload 带 `companionName:"莱卡恩"` 与莱卡恩 userId；回复「帮你和莱卡恩安排好啦」，行程出现包间闽南菜正餐与精品酒店升级房型（对照未注册人名「小明」：街边小摊、无住宿步骤）。

### 踩坑与教训

- **验收脚本第一轮误判「代码没生效」**：同一进程两次跑同一句话，第一次 `TRIP_PLANNED` 没有 companion 键、第二次有。排查后发现第一次那条「泉州」日志其实是**另一条用例**（未注册人名「小明」也是泉州）留下的——莱卡恩那次请求恰好命中 DeepSeek 偶发非法 JSON，走了 `TRIP_DRAFT_FAILED` 降级，没有 trip 落库。教训：验收断言必须**按用例时间窗**取日志，不能只取「最新 N 条」，否则多用例同目的地时会串例。
- **真机 LLM 草稿不稳定是既有行为**：DeepSeek 偶发返回非法 JSON，`draftTrip` 3 次重试后降级为友好追问（`TRIP_DRAFT_FAILED`/`TRIP_UNRESOLVED`），不落库不发事件。这是 FU-13 就有的降级路径，不是本次回归；但会让「同一句话两次请求」的验收偶发空结果，需要多重试几轮再下结论。
- **persona 账号无法验收行程能力**：46 个 persona 种子账号 role=user，而 trip 分支按 `role ∈ {admin, agent}` 门禁（FU-13 身份化修正）直接婉拒，根本不进 `planTripTool`。验收只能用 `user@fairy.local`/`admin@fairy.local`。
- **`pnpm format:check` 仓库级失败与本次无关**：`core.autocrlf=true` 让工作区全是 CRLF，prettier 默认 `endOfLine: lf`，169 个既有文件全部报错（含 README.md、turbo.json 等未改动文件）。判据改成「用 `prettier --end-of-line=crlf` 比对本次改动行」，避免被环境噪声带偏。
- **dev 库脏画像会污染对照基线**：`user@fairy.local` 的 `travelStyle="13"`、`admin@fairy.local` 整份画像是 `"123"` 垃圾值（历史验收键入残留，seed 的 update 分支不重置 travelStyle，重跑 db:seed 清不掉）。本次按 seed 基线显式置回，否则「本人 travelStyle 注入」会注入垃圾值，干扰 AC-4/AC-5 对照。
- **提示词快照文档漏了第四个提示词**：`Fairy/docs/prompts.md`（2026-09-22 建成）只快照 agent 链路三个系统提示词，FU-13 引入的 `TRIP_SYSTEM_PROMPT` 从未进快照，而文档自称「系统提示词逐字快照」、变更规则也写着「改提示词必须同步本文档」——属既有漂移，task 归档后才补（新增 §4 + 调用链分支 + 公共约束适用范围说明）。教训：**新增或修改提示词时，第一件事是核对 prompts.md 的提示词清单**，别等交付完才想起；逐字快照必须配脚本比对（沿用 2026-09-22 的 node 逐字节校验，本次 429 字符一致），不能靠眼看。

### Next Steps

- 本次改动**未提交、未推送、未开 PR**（等负责人指示）：`apps/api` 三个文件 + 需求/状态/架构/工具文档 + Trellis task 已归档至 `.trellis/tasks/archive/2026-10/`。
- 若要把 persona 路径也纳入验收，需由负责人把对应账号提为 agent 角色（属数据/权限变更，未擅自执行）。
- 后续如要做「多同行人偏好协商」「同行人记忆注入」「Trip 记录和谁去」，按新需求另立门禁。

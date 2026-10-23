# FU-20 行程规划同行人画像：对话行程纳入同行者人设

## Goal

Trellis 轨小功能（需求 docs/requirements/2026-10-10-trip-companion-profile.md，2026-10-10 approved）。仅改 apps/api：planTripTool 增加同行人解析（消息人名 -> Profile.name 精确匹配）与 prompt 注入（travelStyle/styleTags/dietPreference/avoidFood，不注入记忆），与用户本人 travelStyle 两行并存标注归属；非注册人名静默降级；TRIP_PLANNED payload 记 companionSlug。零契约变更、零 schema 迁移、不动 shared/db/web。AC-1~AC-8 见需求文档。

## Requirements

- R-1 同行人解析：从已消毒的 plan_trip 消息文本中提取人名，按 `Profile.name` 精确匹配（如「莱卡恩」→ lycaon 的 Profile）。匹配不到返回 null。不做模糊/别名匹配。
- R-2 画像注入：命中同行人时，在现有「用户画像旅行风格」行之外追加同行人行，字段为 `travelStyle` + `styleTags` + `dietPreference` + `avoidFood`（空字段不拼行）；不注入记忆。
- R-3 并存与归属：登录用户本人 travelStyle 与同行人画像同时存在时两行都注入，归属标注清晰（「同行人X的偏好：…」/「你的旅行风格：…」），由 LLM 协调，不做硬优先级。
- R-4 降级：同行人解析失败（无人名/非注册人名/匹配不到）时，prompt 与改动前逐字一致，不报错、不追问、不阻塞行程生成。
- R-5 可观测：`TRIP_PLANNED` payload 增加 `companionSlug`（未命中时省略该键），仅 payload 内，无契约影响。
- R-6 不回归：SSE `trip` 事件形状、Trip 落库字段、REST `/api/trips` 行为不变；既有 api 测试全绿。

## Acceptance Criteria

- [ ] AC-1：「我周末要和莱卡恩出去泉州玩」→ `draftTrip` 的 LLM messages 含莱卡恩画像行（单测断言注入内容，不依赖真实 LLM）
- [ ] AC-2：真机（真实 DeepSeek）行程/回复可观察画像特征（备选方案/餐具就餐/礼仪优雅至少其一），且与不带同行人的基线有可观察差异
- [ ] AC-3：非注册人名（「我周末要和我女朋友去泉州玩」）→ 行为与改动前一致：无注入、无追问、行程照常（单测 + 真机各一）
- [ ] AC-4：无同行人消息（「帮我规划去杭州的行程」）→ 仍只注入登录用户本人 travelStyle，prompt 与改动前逐字一致
- [ ] AC-5：本人与同行人 travelStyle 并存时两行都注入且归属标注清晰
- [ ] AC-6：SSE trip 形状 / Trip 落库字段 / GET /api/trips 行为不变（typecheck + 既有 api 测试佐证）
- [ ] AC-7：api 包测试全绿 + typecheck + lint
- [ ] AC-8：真机覆盖 persona 账号（soldier11@fairy.local）与 dev agent 账号（user@fairy.local）两条登录路径

## Notes

- 轻量任务，PRD-only。
- 决策记录（注入字段/冲突处理/匹配策略/日志/轨道）见需求文档文末，2026-10-10 批准时定稿。
- 验收前置：dev 库两个 dev 账号的脏画像已于 2026-10-10 清理（user@fairy.local 的 travelStyle/dietPreference/avoidFood 还原为 seed 值 null/null/[]，admin@fairy.local 清空为中性值），保证 AC-4/AC-5 基线干净。

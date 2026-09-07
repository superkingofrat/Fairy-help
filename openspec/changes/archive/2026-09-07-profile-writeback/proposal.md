# Proposal: FU-18 画像反向回写 —— 偏好记忆自动沉淀 likeGenres（记忆中心五期）

## Why

对话抽取的偏好记忆（FU-14）只进 `Memory` 表并注入 prompt，而结构化画像字段 `Profile.likeGenres` 仍需 admin 经 FU-1 手工维护——用户聊得越多，结构化画像不会自己生长，推荐与库页筛选的个性化收益受限。FU-15 已明确把「画像反向回写」列为非目标，本提案承接该缺口（需求文档：`docs/requirements/2026-09-07-profile-writeback.md`，已批准）。

## What Changes

- `packages/shared`：`memoryExtractionSchema` 增加可选顶层 `genres` 片型候选数组（≤3；内部 LLM 输出 schema，非公共契约）。
- `apps/api/src/memory/memoryExtractor.ts`：提示词扩展（同一轮抽取同时产出 `genres` 候选）；`extractAndStoreMemories` 在记忆落库后旁路调用画像回写（仅当本轮落库至少一条 `preference` 记忆且候选非空）。
- `apps/api/src/services/profileService.ts`：新增 `mergeLikeGenres(profileId, candidates)` —— 白名单过滤（`Movie.genres` distinct，过滤纯数字/空串脏值；进程内 TTL 缓存 5 分钟）→ 事务内读-合并-写（增量去重、只增不减、无变化则不写）。
- **无新公共 API 端点、无 DB schema/迁移**；失败全部静默降级（与 FU-14 抽取同级），对话 SSE 链路零影响。

## Capabilities

- `memory-center`：**ADDED** requirement「Preference memories backfill profile likeGenres」（3 scenarios：命中白名单增量合并且幂等 / 未命中或无偏好记忆不变 / 故障静默降级）。

## Impact

- **Code**：`packages/shared/src/schemas/memorySchemas.ts`（+测试）、`apps/api/src/memory/memoryExtractor.ts`（+测试）、`apps/api/src/services/profileService.ts`（+测试）；`stateLoop` 等调用方零改动（旁路收敛在 `extractAndStoreMemories` 内）。
- **Docs**：`ARCHITECTURE.md`（§5.4 数据流 + §8 决策 + §9 映射）、`API_CONTRACT.md`（无公共契约变更，仅记忆中心内部行为说明补一句）、`PROJECT_STATUS.md`。
- **Spec**：`openspec/specs/memory-center/spec.md` 归档时合并新增 requirement。
- **风险**：低——纯内部旁路、只增不减、全链路静默降级；最坏情况是 likeGenres 未更新（与现状一致）。

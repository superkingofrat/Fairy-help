# 需求：经典台词进入推荐链路（Fairy 对话引用台词）

> 状态：**draft**（2026-09-24 grill-me 收敛，待用户批准；Trellis 轨）· 日期：2026-09-24 · 负责人：Flores
> 轨道：Trellis（主体单 `apps/api` 文件 + 可选 `apps/web` 展示；`Movie.quote` 已在 shared 类型与响应中存在，不改 `API_CONTRACT.md` 契约形状）
> 前置：推荐链路已交付（`recommendMovieTool` + `responseSynthesizer` recommend 分支 + `RecommendationCard`）；`Movie.quote` 字段与管理端编辑已存在

## 背景 / 问题

《初版项目设定》影片库一节写明影片带「经典台词片段，供 Fairy 在对话中引用」，是感性元数据（mood/scene/quote）三件套之一。现状核查：

- **数据侧齐全**：`Movie.quote String?`（schema，`packages/database/prisma/schema.prisma`）、shared `movieTypes`/`movieSchemas` 均已含 `quote`、seed 数据每部影片都有台词、管理端影片 CRUD 已可编辑 `quote`
- **消费侧为零**：`responseSynthesizer` 的 recommend 分支事实块只含「片名（类型，可借库存）」；`movieLine` 只输出 `《片名》`；LLM 回复 prompt 与模板降级文案都看不到台词；前端 `RecommendationCard` 也不展示
- 结果：台词数据写了、管了，但永远到不了用户——「供 Fairy 在对话中引用」这一设定处于死数据状态；同时 mood/scene 已被推荐链路充分使用，唯 quote 闲置，感性元数据投入只兑现了三分之二

## 目标

让推荐结果中的台词进入用户可见链路，兑现「Fairy 对话引用台词」：

- LLM 生成推荐回复时，事实块注入影片台词，Fairy 可自然引用
- 模板降级路径（LLM 不可用）同样能给出一句台词，保障 §0 降级体验一致
- 无台词的影片不注入、不编造（幻觉防控）；注入带明确指令边界
- 前端推荐卡片展示台词（可选，见待决问题 2）

## 范围

- `apps/api/src/agent/responseSynthesizer.ts`：recommend 分支事实块加台词行；`movieLine`/相关文案助手同步；模板降级文案带台词
- `apps/api/src/__tests__/responseSynthesizer.test.ts`：新增用例（有/无 quote、降级路径、编造防控）
- 可选 `apps/web/src/components/chat/RecommendationCard.tsx`：台词展示（见待决问题 2）
- shared：**无变更**（`quote` 已在 `Movie` 类型与响应负载中）；不新增端点、不改 SSE 形状

## 非目标

- 不改 `recommendMovieTool` 的检索与排序逻辑（台词不影响相关性排序）
- 不给台词做向量检索/相似度引用（属记忆中心后续能力）
- 不为存量数据补录台词（管理端 CRUD 已覆盖维护入口）
- 不改 `API_CONTRACT.md`（`quote` 本就在 `Movie` 响应形状内，前端拿到的数据不变多也不变少）

## 受影响模块

| 模块 | 变更 |
|---|---|
| `apps/api/src/agent/responseSynthesizer.ts` | 事实块 + 降级模板注入台词 |
| `apps/api/src/__tests__/responseSynthesizer.test.ts` | 台词注入/缺失/降级用例 |
| `apps/web/src/components/chat/RecommendationCard.tsx` | 台词展示（可选） |
| `PROJECT_STATUS.md` / `ARCHITECTURE.md` §8 | 交付时登记决策行（提示词事实块格式） |

## 验收标准

- **AC-1**：推荐 ≥1 部带台词影片时，LLM 事实块包含该影片台词原文；真机回复中 Fairy 至少引用一句台词且与库内数据逐字一致
- **AC-2**：影片无 `quote` 时事实块不含该片台词行，回复与降级文案均不出现编造台词
- **AC-3**：LLM 不可用时模板降级文案含一部影片的一句台词；全部推荐均无台词时文案与现状一致（不出现空引号或「台词：」空标签）
- **AC-4**：`GET /api/movies` 响应形状不变（字段集合与现状逐字一致），SSE `recommendation` 事件形状不变
- **AC-5**：api 全量测试 + typecheck + lint 通过；（若采纳待决问题 2）web 测试 + typecheck 通过

## 待决问题

1. **注入形式与数量**：建议事实块内以 `` 《片名》台词：「…」 `` 逐行注入，最多注入前 3 部（避免 prompt 膨胀）；指令明确「可引用，不必全部引用，不得改写或编造」。是否只注入 top 1？
2. **前端卡片展示**：建议展示（卡片内斜体小字，无 quote 不渲染，不占布局）；纯 api 消费则工作量最小——但初版设定中台词是给用户读的，建议展示。
3. **降级文案形式**：建议取第一部带台词影片，文案如「为你找到这些可借的片子：…。『台词原文』——《片名》」；若认为降级文案应保持极简，可只列片名。
4. **台词长度**：seed 台词均 ≤30 字，建议不截断（截断会破坏名句完整性）；如担心极端长台词，可 50 字截断加省略号。

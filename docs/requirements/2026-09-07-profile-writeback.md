# 需求：FU-18 画像反向回写 —— 偏好记忆自动沉淀 likeGenres（记忆中心五期）

> 状态：**implemented**（2026-09-07，用户批准，OpenSpec 轨；同日交付并归档，提案见 ../../openspec/changes/archive/2026-09-07-profile-writeback/proposal.md，验收细节见 PROJECT_STATUS）· 日期：2026-09-07 · 负责人：Flores
> 轨道：OpenSpec（跨 memory + profile 两模块与 LLM 提示词链路；**无新公共 API 端点、无 DB schema/迁移**——`Profile.likeGenres` 已存在）
> 前置：FU-14 记忆抽取、FU-15 记忆管理面、FU-16 向量检索、FU-17 自查入口均已交付归档；FU-15 明确把「画像反向回写」列为非目标，本需求承接该缺口。

## 背景 / 问题

1. **记忆与画像两条线割裂**：对话抽取的偏好记忆（如「喜欢看科幻片，尤其是太空题材的」）只进 `Memory` 表并注入 prompt（FU-14/16），而结构化画像字段 `Profile.likeGenres`（喜好片型）仍需 admin 经 FU-1 管理页手工维护——用户聊得越多，结构化画像不会自己生长。
2. **个性化能力打折**：影片推荐与库页筛选依赖结构化标签；画像缺失时 `likeGenres` 为空，推荐与筛选的个性化收益受限。

## 目标

1. 偏好记忆落库后，自动把可结构化的片型沉淀进该用户 `Profile.likeGenres`（**增量合并去重，从不清空既有标签**）。
2. 抽取一次完成：`memoryExtractor` 提示词在产出记忆的同时产出**结构化片型候选**；仅当候选命中**影片库实有类型词白名单**（`Movie.genres` distinct，过滤脏值）才写入画像。
3. 全程旁路：回写失败静默仅日志，对对话 SSE 链路零影响；满足 AGENTS §6「画像更新原子且幂等」。

## 范围

- `packages/shared`：`memoryExtractionSchema` 扩展片型候选字段（内部 LLM 输出 schema，非公共契约）。
- `apps/api` memory 链路：`memoryExtractor` 提示词扩展（同轮产出 `genres` 候选）+ 旁路接线（记忆落库后尝试回写）。
- `apps/api` profile 侧：增量合并函数（Prisma 事务内读-合并-写，去重幂等）+ 类型词白名单读取（进程内缓存 + 明确失效规则）。
- 测试：shared 抽取 schema、白名单过滤（含脏值「1233」类）、合并去重幂等、旁路失败静默；api 侧 mock LLM，不触真供应商。

## 非目标

- 不回写 `styleTags`/`travelStyle`/`dietPreference`/`avoidFood` 等其余画像字段（后续期再议）。
- 不新增任何公共 API 端点或管理页入口；FU-1 `PATCH /api/profiles` 契约与行为完全不变。
- 不做「以记忆重建/清空」——只增不减，绝不覆盖 admin 手工维护的标签。
- 不处理历史存量记忆的批量回填（只对方案上线后新落库的记忆生效；如需回填另立需求）。
- 不改变 FU-17 自查面板/管理面行为。

## 受影响模块

| 模块 | 变更 |
|---|---|
| `packages/shared` | 记忆抽取 schema 扩展（内部）+ 测试 |
| `apps/api/src/memory/` | `memoryExtractor` 提示词与解析扩展、旁路调用点 |
| `apps/api/src/services/` | `profileService` 增量合并 likeGenres（事务 + 幂等）+ 白名单读取与缓存 |
| 文档脊柱 | `ARCHITECTURE`（§5.4 数据流 + §8 决策 + §9 映射）、`API_CONTRACT`（无公共契约变更，仅内部行为说明）、`PROJECT_STATUS` |
| 测试 | shared / api 相应新增 |

## 验收标准

- **AC-1**：对话后新落库的偏好记忆若含库内片型（如「科幻」），该用户 `Profile.likeGenres` 增量并入并去重；相同内容重复对话不产生重复项（幂等）。
- **AC-2**：记忆内容不含可识别片型，或候选未命中白名单 → `likeGenres` 不变。
- **AC-3**：admin 手工维护的既有标签永不被清除（只增不减）。
- **AC-4**：LLM 故障 / 无 key / 解析失败 / 白名单查询失败 → 静默跳过（仅日志），SSE 对话与记忆落库不受影响。
- **AC-5**：管理页 PATCH `likeGenres` 行为与 FU-1 契约不变；无新端点暴露。
- **AC-6**：白名单跟随影片库类型变化——admin 新增带新类型的影片后，后续回写可命中新类型（缓存失效规则写明）。

## 待决问题（默认值，未答即按默认）

1. 白名单脏值（库内实存「1233」一类条目）：默认过滤纯数字/空串等非类型词。
2. 单轮回写片型数量上限：默认 ≤3 个，防 LLM 泛滥。
3. 白名单缓存失效：默认「影片类型集合变化时失效」（实现取影片 CRUD 钩子或短 TTL 其一，落地时写入 ARCHITECTURE）。

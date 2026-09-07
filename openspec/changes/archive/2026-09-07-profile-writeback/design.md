# Design: FU-18 画像反向回写

## Context

FU-14 起每轮对话 SSE 完成后由 `memoryExtractor.extractAndStoreMemories` 旁路抽取偏好/事实/意图并落库 `Memory`；`Profile.likeGenres: String[]` 现仅能经 FU-1 admin PATCH 维护。本设计在既有抽取旁路上追加一步画像回写，不新增端点、不改表结构。

## Goals / Non-Goals

- **Goals**：偏好记忆 → `likeGenres` 自动增量沉淀；幂等原子；全链路静默降级；白名单与影片库词表一致。
- **Non-Goals**：不回写其他画像字段；不做存量记忆批量回填；不做清空/重建；不改 FU-1 契约；不新增管理 UI。

## Decisions

1. **候选产出为抽取结果顶层 `genres`（turn-level），不挂在每条记忆上** —— 一次 LLM 调用同时产出记忆与片型候选；`memoryExtractionSchema` 增加可选 `genres: string[]`（≤3、逐项 trim 非空）。顶层字段向后兼容（旧解析不受影响，缺省按无候选处理）。
2. **回写门禁 = 本轮落库 ≥1 条 `preference` 记忆且候选非空** —— 与需求 AC-1「落库的偏好记忆」对齐：LLM 只给候选没落偏好记忆时不回写，避免歧义路径。
3. **提示词不注入词表，白名单过滤在代码侧** —— LLM 自由输出候选词，代码用影片库 distinct `genres` 过滤。避免 prompt 与 DB 词表耦合（词表随影片 CRUD 变化）；LLM 提示词仅给输出格式与「片型候选」语义约束。
4. **白名单 = `Movie.genres` distinct + 脏值过滤 + 进程内 TTL 缓存 5 分钟** —— 过滤空串/纯数字（库内实存「1233」类脏数据）；缓存失效规则：固定 TTL（5 分钟），接受新类型最长 5 分钟后才可被回写命中（登记进 ARCHITECTURE，AC-6 满足）。单进程 dev/dev-规模足够，不上分布式缓存。
5. **合并走 Prisma 事务，只增不减、无变化不写** —— `$transaction` 内读 profile（不存在→静默跳过）、`Set` 并集去重，与既有标签无差异则不发起 update（幂等且不无谓翻动 `updatedAt`）；满足 AGENTS §6「画像更新原子且幂等」。
6. **失败静默与 FU-14 同级** —— extractor 侧 `.catch(() => undefined)`，profileService 内部不抛出业务错误（白名单查询失败返回空名单 → 自然无命中）；仅记日志，绝不影响 SSE 与记忆落库。

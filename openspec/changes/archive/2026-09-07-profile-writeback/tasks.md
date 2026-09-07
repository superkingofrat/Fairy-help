# Tasks: FU-18 画像反向回写

## 1. Shared

- [ ] 1.1 `memoryExtractionSchema` 增加可选顶层 `genres`（`z.array(z.string().trim().min(1)).max(3).optional()`）+ 类型导出
- [ ] 1.2 shared 测试：genres 候选解析（含缺省兼容旧输出、超 3 个拒绝、空白剔除）

## 2. API — memory 链路

- [ ] 2.1 `memoryExtractor` 提示词扩展：同一 JSON 增产 `"genres":["片型"]` 候选（语义约束：仅用户表达影片偏好时输出，最多 3 个）
- [ ] 2.2 `extractAndStoreMemories` 旁路接线：落库 ≥1 条 preference 且候选非空 → 调 `profileService.mergeLikeGenres`（catch 静默）
- [ ] 2.3 测试：mock llmClient/profileService —— 有 preference+候选触发回写、无 preference 不触发、回写抛错不影响落库与返回

## 3. API — profile 侧

- [ ] 3.1 白名单读取：`Movie.genres` distinct + 过滤空串/纯数字；进程内 TTL 缓存 5 分钟（失效规则注释与 ARCHITECTURE 登记一致）
- [ ] 3.2 `mergeLikeGenres(profileId, candidates)`：事务内读 profile（缺失静默跳过）→ Set 并集去重 → 无变化不写、有变化 update；只增不减
- [ ] 3.3 测试：命中合并去重、重复调用幂等（第二次不 update）、脏值/未命中过滤、profile 缺失静默、白名单查询失败静默、既有标签不被删除

## 4. 文档脊柱

- [ ] 4.1 `ARCHITECTURE.md`：§5.4 数据流补回写支路、§8 决策行、§9 模块映射（memoryExtractor/profileService 注记）
- [ ] 4.2 `API_CONTRACT.md`：记忆中心内部行为说明补一句（无公共契约变更）
- [ ] 4.3 `PROJECT_STATUS.md`：完成时移入 Completed + Last Updated

## 5. 验证与归档

- [ ] 5.1 shared/api typecheck + 测试全绿（mock LLM，不触真供应商）
- [ ] 5.2 真机验收 AC-1~AC-6（双进程 + 真实 LLM 对话 → likeGenres 增量沉淀、幂等重放、未命中不变、故障降级、FU-1 PATCH 不变、新类型缓存延迟说明）
- [ ] 5.3 `openspec validate --all` → archive → journal Session 18

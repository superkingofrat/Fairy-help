# Workspace Index - Flores

> Journal tracking for AI development sessions.

---

## Current Status

<!-- @@@auto:current-status -->
- **Active File**: `journal-1.md`
- **Total Sessions**: 26
- **Last Active**: 2026-09-23
<!-- @@@/auto:current-status -->

---

## Active Documents

<!-- @@@auto:active-documents -->
| File | Lines | Status |
|------|-------|--------|
| `journal-1.md` | ~1182 | Active |
<!-- @@@/auto:active-documents -->

---

## Session History

<!-- @@@auto:session-history -->
| # | Date | Title | Commits | Branch |
|---|------|-------|---------|--------|
| 26 | 2026-09-23 | 主动运营建议（阈值异常 + 每日经营日报 + 管理端建议流）：OpenSpec 全闭环归档，验收期修复 reasoning 模型预算截断 | `85700c1`, `6caccfd`, `4fc6ad1`, `11ceef1`, `6aa39e7` | `feature/travel-planning-phase-2` |
| 25 | 2026-09-23 | 旅行规划二期（FU-19）：REST 行程端点复用 planTripTool + /trips 页 + Amap JS 地图叠加，OpenSpec 全闭环归档 | `2a9da18`, `756c52f`, `261ac00`, `4c41058` | `feature/travel-planning-phase-2` |
| 24 | 2026-09-22 | 部署落地批次（批次 7）：容器化、部署清单、真实库并发集成测试、文档补全 | `40bfd4e`, `f814ea9`, `9bc90a3`, `0c0e3d1`, `005d826`, `e76962e`, `41da6fe`, `ed2a737` | `chore/reliability-fixes` |
| 23 | 2026-09-22 | 产品修复批次（批次 6）：行程门禁身份化（role∈{admin,agent}）+ 意图规则语境修正 + 错误信息归一化 | `19da2df`, `4b18057`, `0db19a2`, `8c20656` | `chore/reliability-fixes` |
| 22 | 2026-09-22 | 安全整改批次（批次 5）：prompt 不可信跨度标记 + refresh 旋转 CAS + 多标签会话同步与 SSE 401 刷新 | `43e0850` | `chore/reliability-fixes` |
| 21 | 2026-09-22 | 工程验证门禁与可靠性整改：15 个提交（门禁+CI+8 个 P1 bug） | `be0f8c7`, `9d816e5`, `3c9dacf`, `c50cf39`, `b384984`, `40e00c2`, `7d771c9`, `78d5e70`, `070575e`, `f85f4e0`, `ae8151d`, `c889d5b`, `171b0f9`, `74f8b32`, `870a5ac` | `chore/reliability-fixes` |
| 20 | 2026-09-20 | P0/P1 audit fixes: register blank profile + chat rate limit + prompt token budget | `1eb4375`, `7e591dc`, `3c348a1`, `44571a5` | `master` |
| 19 | 2026-09-20 | True streaming chat + borrow/return concurrency safety + frontend SSE event handling (journal: `2026-09-20-streaming-cas-sse.md`) | `7908089`, `56eb3b2`, `e699f44`, `8bdd77c` | `master` |
| 18 | 2026-09-07 | FU-18 profile writeback (preference memory → Profile.likeGenres auto merge) delivery and archive | `925c457`, `a546693`, `96348db` | `master` |
| 17 | 2026-09-07 | FU-17 memory self-inspection entry (in-chat read-only panel + GET /api/memories/me) delivery and archive | `0a4f823`, `aece246`, `718645a` | `master` |
| 16 | 2026-09-06 | FU-16 pgvector vector retrieval (memory center phase 3: hybrid retrieval) delivery and archive | `105b45b`, `047f9a3`, `d723b4a` | `master` |
| 15 | 2026-09-06 | FU-15 memory-center phase 2 (admin memory management REST + /admin/memories page) delivery and archive | `293a12e`, `a14665e`, `474b6d9` | `master` |
| 14 | 2026-09-06 | FU-14 memory-center (phase 1: structured memory persistence + retrieval injection) delivery and archive | `b98dbab`, `a948256`, `5f3ccbb` | `master` |
| 13 | 2026-09-01 | FU-13 travel planning (chat trip generation) delivery and archive | (see git log) | `master` |
| 12 | 2026-09-01 | FU-12 store insight chat tool (storeInsightTool + admin-gated chat Q&A) delivery and archive | `802e920` | `master` |
| 11 | 2026-09-01 | FU-11 store insights dashboard (admin overview + /admin/insights page) delivery and archive | `3fc6840` | `master` |
| 10 | 2026-09-01 | FU-10 account closure (register / rate limit / refresh token) delivery and archive | `70a9afc` | `master` |
| 9 | 2026-09-01 | FU-7 session table and chat history replay delivery and archive | `e9fe777`, `974fad8` | `master` |
| 8 | 2026-09-01 | FU-9 movie library page delivery and archive | `479b17b`, `1a25eac` | `master` |
| 7 | 2026-09-01 | Session 7: FU-8 one-click return UI delivery and archive | `3e363df`, `a8ea7cd` | `master` |
| 6 | 2026-09-01 | FU-6 REST 借阅交付：REST 端点复用 chat 事务 + 全流程归档 | `86fd91a`, `ecc0c3a` | `master` |
| 5 | 2026-08-31 | FU-5 真实 JWT 认证交付（仅登录）：stub 移除 + 全栈身份改造 | `0182cb4`, `3e90280`, `35c72a2` | `master` |
| 4 | 2026-08-30 | FU-4 归还交付与验收期 P0/P1 修复（枚举迁移延迟部署 + SSE 流内降级） | `956f60b`, `da84300`, `5f10e25`, `a2a84cc` | `master` |
| 3 | 2026-08-29 | FU-2 真实 LLM 交付：ai-sdk 三供应商 + 意图/回复 LLM 化 + 规则降级 | `58cbd61`, `40c3036`, `51f3a97` | `master` |
| 2 | 2026-08-29 | Phase 2 落库与仓库安全加固；FU-1 画像写接口全流程交付 | `361d0a6`, `218832f`, `89ec6c5`, `d104dd3`, `8e73de6`, `a98a159`, `f1d7667` | `master` |
| 1 | 2026-08-20 | Movie CRUD MVP delivery and agent norms | `714538b` | `master` |
<!-- @@@/auto:session-history -->

---

## Notes

- Sessions are appended to journal files
- New journal file created when current exceeds 2000 lines
- Use `add_session.py` to record sessions
# AI 执行规范与脊柱文档对齐复盘

**Date:** 2026-08-20
**Status:** implemented（已交付并归档；真机验收与归档记录见 PROJECT_STATUS.md Completed Modules）
**Complexity:** complex

## Goal

梳理 Fairy 项目中「AI 该怎么动」的规范来源，找出脊柱文档与 grill-me / OpenSpec / Trellis 之间的缺口，并产出可写入 `AGENTS.md` 的确认门禁，避免再次出现「未批准就写代码」「联调缺 checklist」等问题。

## Background

### 已确认事实（文档与本次会话）

| 来源 | 写了什么 | 缺口 |
|---|---|---|
| `AGENTS.md` §0 | OpenSpec：**提案批准前不得实现** | 未写 grill-me approve、Trellis `task.py start`、bug/联调例外 |
| `AGENTS.md` §13.1 | `AGENTS.md` = **AI 行为宪法** | 正文缺少分阶段「确认后才能改代码」专节 |
| `AGENTS.md` §13.2 | 变更 AI 工作流 → 更新 `AGENTS.md` | 本次复盘结论尚未落盘 |
| `AGENTS.md` §8–§9 | 双 dev server、`.env` 从 example 复制 | **未写** `apps/api/.env` 与 `packages/database/.env` 双份 `DATABASE_URL` 必须一致 |
| `学习过程.md` | grill-me → OpenSpec propose → **审核** → apply | 不在四份脊柱内，AI 不一定加载 |
| `grill-me` skill | approve 前禁止产品代码 | 在 `~/.cursor/skills/`，非 repo 脊柱 |
| `.trellis/workflow.md` | 建任务 ≠ 实现；`task.py start` 门禁 | 在 `.trellis/`，与 OpenSpec 路径并行 |
| `docs/requirements/` | MVP CRUD 已 approved | 实现时跳过部分 Trellis Phase 1.4 审阅 |

### 本次会话暴露的执行偏差

1. 用户 approve 需求后，直接 dispatch `trellis-implement`，未明确 `task.py start` 前审阅 artifacts
2. 联调时未按 §8 先确认 api(3000) + web(5173) 双进程
3. 只更新 `packages/database/.env`，`apps/api/.env` 滞后 → API 500
4. Bug 修复（`movieApi.ts`）未事先说明范围并征得确认（规范边界模糊）

### 规范分层（当前实际状态）

```
Layer 1  宪法（AGENTS §0）     → 不可协商，但偏「原则」少「流程」
Layer 2  工作流（学习过程 / Skills / Trellis）→ 详细，但分散、非脊柱
Layer 3  工程（Setup / Dev Tips）→ 有，但缺 monorepo 联调细节
Layer 4  文档治理（§13）       → 改代码前读文档；改 AI 行为要回写 AGENTS
```

## Requirements

1. 在 `AGENTS.md` 新增 **§15 Agent Approval Gates（智能体确认门禁）**，作为 AI 分阶段改代码的唯一脊柱来源。
2. §15 须包含：
   - **双轨实现路径**（Trellis + requirements vs OpenSpec）及判定标准
   - **分级豁免**（P0 / P1 / 新功能）
   - **记录矩阵**（项目踩坑 → Trellis journal；方法论 → `学习过程.md`）
   - **本地联调 checklist**（双 dev server、双 `.env` 同步）
3. 在 `AGENTS.md` §9 补充 monorepo 双 `.env` 与 API 重启规则（不重复 §15 全文，交叉引用）。
4. 可选：`学习过程.md` 将 `docs/decisions/` 引用改为 `docs/requirements/`。

## Acceptance Criteria

- [x] `AGENTS.md` 存在 §15，且 §13.1 表格或 §13.2 映射表包含 §15
- [x] §15 明确：新功能门禁、双轨判定、P0/P1 豁免、记录去向
- [x] §9 含 `packages/database/.env` 与 `apps/api/.env` 的 `DATABASE_URL` 必须一致
- [x] §9 含联调须同时运行 api(:3000) 与 web(:5173)，改 `.env` 后重启 API
- [x] 本文档 Status 改为 **approved**（用户确认后）

## In Scope

- `AGENTS.md` §15 新增 + §9 增补
- 本需求文档收敛与 approve
- （approve 后）`学习过程.md` 目录引用修正

## Out of Scope

- 重写 Trellis workflow 或 grill-me skill 全文（仅 §15 交叉引用）
- OpenSpec 流程本身变更
- Movie CRUD 功能代码或 Trellis task 归档（另开收尾）

## Key Decisions

| Decision | Choice | Rationale | Trade-off |
|---|---|---|---|
| 确认门禁权威位置 | **A：`AGENTS.md` 新增 §15** | §13.1 已定义 AI 行为宪法；复盘结论应落盘脊柱 | 需维护与 Skill/Trellis 引用一致 |
| 过程复盘记录 | **选项 1：项目踩坑 → Trellis journal；方法论 → `学习过程.md`** | 项目记忆可检索；个人笔记与脊柱分离 | 会话结束须跑 `/trellis:finish-work` |
| 默认实现路径 | **C：双轨** | 小功能走 Trellis + requirements；跨模块/架构/API 契约变更走 OpenSpec | 需在 §15 写清「小 vs 大」判定标准 |
| Bug/联调豁免 | **C：分级** | P0 直接修 + 事后 journal；P1 说明范围后修；新功能仍走完整门禁 | P0/P1 边界须在 §15 举例说明 |
| `docs/decisions/` | **废弃，统一 `docs/requirements/`** | 与学习过程旧流程对齐到现有目录 | 需更新 `学习过程.md` 引用 |

## Risks & Open Questions

- [x] 确认门禁 → `AGENTS.md` §15
- [x] 记录矩阵 → journal vs 学习过程
- [x] Trellis vs OpenSpec → **双轨 C**
- [x] Bug/联调豁免 → **分级 C**

_已全部收敛_

## Affected Modules

- `AGENTS.md`（主要）
- 可选：`ARCHITECTURE.md`（若补充 dev 拓扑 / 双 `.env`）
- `docs/requirements/README.md`
- `.cursor/skills/grill-me`（与脊柱对齐引用）

## Next Step

- [x] 四项决策题全部回答
- [x] 用户 **approve** 本文档
- [ ] approve 后：起草 `AGENTS.md` §15 + §9 增补 → **已完成**

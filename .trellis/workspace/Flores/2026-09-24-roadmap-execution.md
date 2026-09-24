# 2026-09-24 路线图执行会话：PR 合并门禁落地 + CI 修复 + token 预算 P1 修复 + 文档治理

分支与提交：`fix/intent-history-token-budget`（PR #2，merge commit `a18e16f`）、`docs/refresh-requirement-statuses`（PR #3，merge commit `1ee3f6b`）、`docs/requirement-candidates-round-1`（PR #4）。本会话为「接手路线图」执行：第 0 步合并 53 个积压提交 → CI 两处工程缺陷修复 → token 预算 P1 修复（§15.2 P1 豁免）→ 需求 Status 漂移治理 → 两份候选需求文档登记待批准。

## 流程与门禁

- 用户「开始吧」批准执行 roadmap：第 0 步合并走 PR；第 2 步两项 P1 修复（范围已在 roadmap 中向用户说明，§15.2 P1 豁免成立）；第 3 步候选功能只写需求文档待批准，**批准前不写产品代码**。
- PR 描述均引用已归档 OpenSpec 提案（2026-09-22-travel-planning-phase-2、2026-09-23-proactive-ops-suggestions）或说明豁免类别（§15.2 P1），符合 §10「PR 必须引用提案或说明紧急修复」。

## 关键发现与修复

### 1. CI 首次真正运行即两连失败（PR #1）

- **失败一**：`Dependencies lock file is not found`——`actions/setup-node` 的 `cache: pnpm` 忽略 `defaults.run.working-directory`，去仓库根找 `pnpm-lock.yaml`，而锁文件在 `Fairy/` 子目录。修：`cache-dependency-path: Fairy/pnpm-lock.yaml`。
- **失败二**：typecheck 级联假失败（`Memory`/`Movie`/`Prisma.Sql`「模块无导出成员」）——CI 从未执行 `prisma generate`；turbo 图的 build 只做 tsc，不跑 generate，本机不踩仅因本地有生成产物。修：install 后显式 `pnpm --filter=@fairy/database generate`。
- **教训**：此前所有「CI 绿」都是本机手工等价执行，`.github/workflows/ci.yml` 自 2026-09-21 加入后从未在 GitHub 上真正跑过——**工作流上线后的第一个 PR 必然暴露配置债，合并大门类 PR 前应先推一个小 PR 探路**。

### 2. token 预算 P1 修复（两个 api 提交，PR #2）

- **裁剪方向偏差（§13.3 案例）**：`trimHistoryToBudget` 原实现从**尾部**裁剪，超预算时保留的反而是最旧轮次，与需求文档 2026-09-20-prompt-token-budget「历史裁剪时保留最新 N 条」相反。按 §13.3「代码与脊柱文档不一致以文档为准」改代码：二分查找可丢弃前缀、裁剪点落在 turn 中间时回退到下一完整行。该需求文档自身第 23 行「尾部裁剪」与第 24 行「保留最新 N 条」自相矛盾——按下条为准并留勘误注记（此类文档内部矛盾应在 grill-me 收敛期就消掉）。
- **分类路径纳管**：`classifyIntent` 的历史注入绕过预算（2026-09-22 安全批次登记的风险条目）本次消除：分类不注入记忆，budget 全额给历史，`wrapUntrustedSpan` 包装不变。
- **测试写法升级**：原测试只断言「变短了」，发现不了方向错误；改为断言方向（15000 字最旧轮次必须被丢、半行边界回退、prompt token 上界）。

### 3. git 网络与工作树坑

- **github.com:443 直连被 TCP 阻断**（DNS 到 20.205.243.166）：fetch/push 一律 `git -c http.proxy=socks5h://127.0.0.1:10808 <cmd>`（本地代理）。用户已要求「下次记得提醒我开梯子」——**后续会话涉及 git 推送/fetch 前先提醒用户确认代理/梯子**。
- 曾尝试经 GitHub API 手工重建 master 上的 merge commit（`git hash-object -t commit`）对齐远端历史，因时区（本地 +0800 vs 服务端 +0000）与字节级复现困难放弃——**远古考古不可取，代理 fetch 直取才是正路**。
- **prettier 全量告警是本地假象**：`core.autocrlf=true` 把 LF 检出成 CRLF，`prettier --check`（endOfLine 默认 lf）因此报 167 个文件含 `.prettierrc` 自身；CI 在 Linux 检出 LF 不受影响。判定方法：`prettier --check --end-of-line auto`。**本地 format 全红先查 autocrlf，别急着重排全仓**。

### 4. 文档治理

- `docs/requirements/` 21 份文档 Status 停留在 `approved` 实际早已交付——统一刷新为 `implemented`（26 行索引，补登缺失的 FU-10 行，修复指向未归档路径的提案链接），三种历史头部格式（`**Status:**` / `- 状态：` / 块引用）各自就地转换。
- 两份候选需求文档（草稿待批准，Trellis 轨）：Fairy 拟人化形象（`FairyAvatar` 静态 emoji 且全仓无 import、ARCHITECTURE §9 预告的 `expressions` 不存在——§13.3 漂移由需求补齐）、经典台词进推荐链路（`Movie.quote` 数据/类型/管理端编辑齐全但 `responseSynthesizer` 与卡片均不消费——感性元数据三件套只兑现两件）。

## 验证

shared 116 / api 403（1 skip 真实库门控）/ web 135 全绿 + 三包 typecheck + `pnpm lint`；prettier 按 `--end-of-line auto` 复核干净。三份 PR 均 CI 转绿后合并；密钥安全：三份 `.env` 0 跟踪，diff 0 处疑似 key，令牌经 git credential 非交互读取未回显；工作树两份未跟踪私有 xlsx 未纳入提交。

## 待办（交接）

- PR #4（候选需求文档）CI 转绿后合并。
- 候选 1/2 待用户批准（§15.1 Trellis 轨：批准 → 建 task → 审 PRD/design → `task.py start` → 实现）。
- 行为日志引用（初版设定「Fairy 可在对话中引用历史」未落地）可作为下一批候选。

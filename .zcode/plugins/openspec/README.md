# openspec 插件（ZCode）

为 ZCode 提供 OpenSpec 规格驱动工作流的斜杠命令（正文移植自 OpenSpec CLI 1.8.0 为 Cursor 生成的 `.cursor/commands/opsx-*.md`，仅调整 frontmatter 与 `/opsx-xxx` → `/opsx:xxx` 命名）。

## 命令一览

| 命令 | 用途 |
|---|---|
| `/opsx:explore` | 探索模式：想清楚问题、调研代码库、澄清需求（只思考不实现） |
| `/opsx:propose` | 创建新 change 并按 schema 生成全部规划工件（proposal / specs / design / tasks） |
| `/opsx:apply` | 按 tasks 逐项实现 change（只改代码与 tasks 勾选） |
| `/opsx:update` | 修订已有规划工件并保持彼此一致（不改代码） |
| `/opsx:sync` | 把 change 的 delta specs 智能合并进主 specs |
| `/opsx:archive` | 归档完成的 change（先评估是否 sync，再移动目录） |

所有命令均通过本机 OpenSpec CLI（`openspec`，1.8.0）驱动 `openspec/` 目录，不绕过工具。

## 双层结构（为什么有两份命令文件）

ZCode 的插件安装机制是**用户级**的：从 marketplace 安装后对本机所有工作区生效，启用状态存在 `~/.zcode/cli/config.json`，不存在"工作区级插件注册"。本插件要求**只在本项目生效**，因此：

- **`commands/opsx/*.md`（本目录）**：插件包本体，是内容的**源头**。随仓库版本管理，也预留了 `marketplace.json`，将来若想在所有项目使用，可在 ZCode **Settings → Plugin Management → Discover → ＋** 添加本地目录 `E:\Fairy-help\.zcode\plugins\openspec` 并安装（`name@marketplace` = `openspec@fairy-openspec-local`）。
- **`<仓库根>/.zcode/commands/opsx/*.md`**：项目级激活副本。ZCode 对 workspace 命令的发现顺序高于插件，仅在本仓库扫描 `.zcode/commands/`，这正是"只在项目装"的落地方式。

两份内容当前完全一致；若将来真的全局安装了插件，可删除 `.zcode/commands/opsx/` 激活副本（内容一致，双份共存也无冲突）。

## 同步与升级

- 命令正文由 OpenSpec CLI 生成。`openspec update` 只会刷新它认识的工具目录（如 `.cursor/commands/`），**不会**更新本插件。Cursor 版更新后，需按同样方式重新移植（换 frontmatter、`/opsx-xxx` → `/opsx:xxx`），并同步修改两份位置。
- `opsx:continue` / `opsx:new` 属于 OpenSpec 的 expanded-profile 工作流，本机未生成，相关命令文中已做缺省处理；如后续 `openspec update` 生成了对应文件，可按同一规则并入。

## 项目背景

OpenSpec 工作流的门禁与文档脊柱约定见 `AGENTS.md` §0、§13、§15；规格与 change 目录见仓库根 `openspec/`（`config.yaml` 已含 Fairy 项目上下文）。

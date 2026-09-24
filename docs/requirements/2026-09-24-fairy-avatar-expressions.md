# 需求：Fairy 拟人化形象 —— CSS 动画头像与表情切换

> 状态：**draft**（2026-09-24 grill-me 收敛，待用户批准；Trellis 轨）· 日期：2026-09-24 · 负责人：Flores
> 轨道：Trellis（仅 `apps/web` 单包；无新端点、无 schema 变更、不改 `API_CONTRACT.md` 公共契约、不改 `ARCHITECTURE.md` 模块边界——§9 已预先写明 `components/fairy/ # FairyAvatar, expressions`）
> 前置：无（`components/fairy/FairyAvatar.tsx` 已存在但为静态占位，见背景）

## 背景 / 问题

《初版项目设定》功能模块第 1 条写明「拟人化的 Fairy 动画形象（CSS 动画），支持表情切换」，是项目「情感化设计」亮点的门面。现状核查：

- `apps/web/src/components/fairy/FairyAvatar.tsx` 只是一个静态 emoji 圆环（`🧚` + `bg-indigo-100`），无动画、无表情、无 props
- 该组件**没有任何使用方**（全仓无 import）——聊天界面头部只有标题与按钮，Fairy 在 UI 上没有形象
- `ARCHITECTURE.md` §9 模块映射预先写明了 `components/fairy/ # FairyAvatar, expressions`，但 `expressions` 并不存在——文档先行、代码缺失的漂移（§13.3：以文档为准，本需求即补上这块代码）
- 结果：用户全程面对纯文字界面，「Fairy 人设」只停留在回复文案里，初版设定的门面能力未落地

## 目标

给 Fairy 一个拟人化的 CSS 动画形象，按对话状态切换表情，让「人设」可被看见：

- 形象挂载到用户可见位置（聊天头部 + Fairy 消息旁），不再是死代码
- 表情状态可由前端现有状态推导（无新增后端能力）：待机 / 思考（等待首个 token）/ 说话（流式输出中）/ 开心（借阅成功等正向事件）
- 纯 CSS 动画（呼吸、眨眼、说话口型等），零新依赖、零素材文件；用户开启「减弱动态效果」时降级为静态表情

## 范围

- `apps/web/src/components/fairy/`：重写 `FairyAvatar`（受控组件：`expression` + 尺寸 props）+ 新增 `expressions`（表情定义与样式）
- 挂载点：`ChatPage` 头部、`MessageStream` 的 Fairy 消息行（具体位置见待决问题 3）
- 状态来源：`chatStore` 的流式状态 + 现有 SSE 事件（`borrow` 成功 → `happy`），不新增 store 字段以外的新状态机
- i18n：表情的无障碍标签（`aria-label`）进 `locales/zh-CN.json`
- 测试：组件渲染各表情状态、挂载点集成用例；`prefers-reduced-motion` 降级断言

## 非目标

- 不做 Live2D / 3D / 图片或音频素材（保持零素材、纯 CSS）
- 不改 SSE 事件形状、不新增 API 端点（表情全部由前端可观测状态推导）
- 不做「从对话内容推断情绪」的后端/模型能力（另立需求）
- 不做表情商店/自定义表情/用户上传

## 受影响模块

| 模块 | 变更 |
|---|---|
| `apps/web/src/components/fairy/FairyAvatar.tsx` | 重写为受控表情组件 |
| `apps/web/src/components/fairy/expressions*` | 新增：表情定义、样式与动画 |
| `apps/web/src/components/chat/ChatPage.tsx` | 头部挂载 + 状态接线 |
| `apps/web/src/components/chat/MessageStream.tsx` | Fairy 消息行挂载（若采纳待决问题 3 的方案 b） |
| `apps/web/src/locales/zh-CN.json` | 无障碍标签键 |
| `apps/web/src/components/fairy/*.test.tsx` | 新增测试 |

## 验收标准

- **AC-1**：聊天页可见 Fairy 形象，默认待机表情（呼吸动画），非占位死代码
- **AC-2**：发送消息后思考期显示「思考」表情，首个 token 到达切「说话」表情，流式结束回「待机」
- **AC-3**：借阅成功事件后短暂（约 2 秒）显示「开心」表情再回待机；失败/无库存不触发
- **AC-4**：`prefers-reduced-motion: reduce` 下所有动画停止、表情静态可辨
- **AC-5**：表情切换在 api/web 双 dev server 真机可见；web 全量测试 + typecheck + lint 通过；无新依赖（`package.json` 无变化）

## 待决问题

1. **表情集合**：建议最小四态 —— 待机 / 思考 / 说话 / 开心（由流式状态与 borrow 事件驱动），不做更细的喜恶怒哀（无对应信号源，易过度设计）。是否再加「出错」态（流错误时）？
2. **动画实现**：建议纯 CSS keyframes（组件内 `<style>` 或 `index.css` 扩展）+ tailwind 静态类，不引 framer-motion 等动画库（与「零新依赖」一致）。是否接受为动画单独建 CSS 文件？
3. **挂载位置**：建议 (a) ChatPage 标题旁一个主形象 + (b) Fairy 消息行小头像，二选一或都要——都要则工作量与测试面上浮，建议先 (a)。
4. **视觉风格**：建议保留现有 🧚 emoji 作「脸」，用 CSS 加上身体/翅膀/口型等部件拟人化（不引入图片素材）；可否接受完全自绘 CSS 形象（工作量大、风险高）？

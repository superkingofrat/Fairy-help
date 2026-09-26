# 需求：Fairy 拟人化形象 —— CSS 动画头像与表情切换

> 状态：**approved**（2026-09-24 用户批准；Trellis 轨。批准前为 draft：2026-09-24 grill-me 收敛）· 日期：2026-09-24 · 负责人：Flores
> 轨道：Trellis（仅 `apps/web` 单包；无新端点、无 schema 变更、不改 `API_CONTRACT.md` 公共契约、不改 `ARCHITECTURE.md` 模块边界——§9 已预先写明 `components/fairy/ # FairyAvatar, expressions`）
> 前置：无（`components/fairy/FairyAvatar.tsx` 已存在但为静态占位，见背景）

## 背景 / 问题

《初版项目设定》功能模块第 1 条写明「拟人化的 Fairy 动画形象（CSS 动画），支持表情切换」，是项目「情感化设计」亮点的门面。现状核查：

- `apps/web/src/components/fairy/FairyAvatar.tsx` 只是一个静态 emoji 圆环（`🧚` + `bg-indigo-100`），无动画、无表情、无 props
- 该组件**没有任何使用方**（全仓无 import）——聊天界面头部只有标题与按钮，Fairy 在 UI 上没有形象
- `ARCHITECTURE.md` §9 模块映射预先写明了 `components/fairy/ # FairyAvatar, expressions`，但 `expressions` 并不存在——文档先行、代码缺失的漂移（§13.3：以文档为准，本需求即补上这块代码）
- 结果：用户全程面对纯文字界面，「Fairy 人设」只停留在回复文案里，初版设定的门面能力未落地

## 形象设计依据（2026-09-24 负责人指示调研，来源可查证）

负责人批准时指示「去网上找一下绝区零 Fairy 的形象」。调研结论（fandom 与 HoYoWiki 本站不可达，采用可达的 biligame ZZZ WIKI 与萌娘百科，均可复访）：

- **身份与声线**（biligame WIKI NPC 页）：全名「Ⅲ型总序式集成泛用人工智能」，Random Play 录像店助手，称呼玩家为「主人」；中文 CV 汪滢滢 / 日 CV 石原夏织。待机对话样本（逐字可见于 wiki）确立声线：官方敬语 + 冷面黑暗幽默（「已将此列入本店的猎杀名单」「我可以播放您喜欢的歌曲作为哀乐」）。aria-label 与文案保持这一口吻。
- **外观关键特征**（萌娘百科角色页 + 游戏内 HDD 形象）：小型悬浮 hologram 少女形象；**青绿/蓝绿短发**（标志性呆毛）、**蓝瞳**（萌娘百科资料卡「瞳色：蓝瞳」）、蓝白主色 + 黑色女仆装、白色女仆头饰、背后半透明蝶翼、底部全息光环底座。别号「新艾利都最强智能管家」「许愿精灵」。
- **配色证据**（游戏内建模图客观取色）：深色底上的蓝紫全息辉光（navy #003060–#2060A0 区间）与蓝白圈图标（萌娘百科：「外圈饱和度更高的蓝色，蓝白圈之间四个角」）。
- **决策：CSS/SVG 自绘还原设计特征，不将米哈游原画/建模素材提交进仓库**——原画版权归 HoYoverse， portfolio 项目提交 ripped 素材有侵权风险；按设计特征自绘（青绿发、蓝瞳、女仆头饰与裙装、蝶翼、全息底座、蓝白配色）既满足「拟人化形象」目标又零素材、零版权风险。负责人如需直接嵌入官方立绘本仓库，需另行明确指示并自负版权责任。

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
4. **视觉风格**：已按调研结论定稿——纯 CSS/SVG 自绘还原 Fairy 设计特征（青绿短发 + 呆毛、蓝瞳、女仆头饰与黑白裙装、半透明蝶翼、全息光环底座、蓝白主色），零素材文件、零版权风险；不引入官方原画，不引图片/音频资产（见「形象设计依据」节）。「脸」部分自绘（不用 🧚 emoji 充数——emoji 与 Fairy 形象差距大且跨平台渲染不一）。

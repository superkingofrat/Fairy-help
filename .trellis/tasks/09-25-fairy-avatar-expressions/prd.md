# Fairy 拟人化形象：CSS 动画头像与表情切换

## Goal

Trellis 轨小功能：docs/requirements/2026-09-24-fairy-avatar-expressions.md（approved）。重写 FairyAvatar 为纯 CSS/SVG 自绘形象（设计依据见需求文档「形象设计依据」节：青绿短发+呆毛、蓝瞳、黑白女仆头饰、半透明蝶翼、全息光环底座、蓝白主色；不提交米哈游原画），四档表情 idle/thinking/speaking/happy + 眨眼/浮动动画 + prefers-reduced-motion 降级，挂入 ChatPage 头部，aria-label 走 i18n，测试随源码。仅 apps/web、无契约变更。AC-1~AC-5 见需求文档。

## Requirements

- **R-1 受控表情组件**：`FairyAvatar` 重写为受控组件，props = `expression`（`idle | thinking | speaking | happy`）+ `size`（sm/md/lg 或像素尺寸）+ 透传 className；无内部表情状态机（状态由调用方按 chatStore/SSE 事件推导），保证纯展示、可测。
- **R-2 纯 CSS/SVG 自绘形象**：按需求文档「形象设计依据」节还原设计特征——青绿（teal）短发 + 呆毛、蓝瞳、白色女仆头饰、黑白裙装、背后半透明蝶翼、底部全息光环底座、蓝白主色；脸/发/瞳/头饰用 SVG 图形（可在 jsdom 中断言 DOM 结构），翅膀与光环可半透明叠加。零图片/字体/Live2D 资产，不引动画库，`package.json` 零变化。
- **R-3 四档表情差异可辨**：idle（自然视线 + 呼吸浮动）、thinking（视线偏移/头上流动全息点点/呆毛轻摆）、speaking（嘴部开合 + 语气亮点）、happy（弯眼笑 + 光环上浮 + 呆毛翘起）；每档在静态降级下仍可区分（§AC-4）。
- **R-4 挂载与状态接线**：ChatPage 头部主形象（lg）：默认 idle；发出消息至首个 token → thinking；流式中 → speaking；done → idle；`borrow` SSE 事件 success → happy 约 2s 后回 idle；失败/无库存不触发 happy。Fairy 消息行小头像（sm，静态按角色存在性渲染，不参与表情状态机）。
- **R-5 无障碍**：表情档位与「Fairy」本体的 aria-label 进 `locales/zh-CN.json`（口吻按设定：敬语 + 冷面幽默，不暴露实现细节如 "idle"）；无颜色单义传达（表情同时改变形状）。
- **R-6 减弱动态效果降级**：`usePrefersReducedMotion`（matchMedia `prefers-reduced-motion: reduce`，无 matchMedia 环境视为不降级）为 true 时不挂动画类、SVG 静态渲染；CSS 侧同步写 `@media (prefers-reduced-motion: reduce)` 兜底（双保险）。
- **R-7 测试随源码**：`apps/web/src/components/fairy/FairyAvatar.test.tsx`（四档表情各自渲染差异、props 透传、aria-label 随文案表解析、reduced-motion hook 桩下无动画类、降级 CSS 文件含 media 兜底——文件静态断言）；ChatPage/MessageStream 挂载集成（Fairy 消息行出现头像、无回归）；既有 ChatPage/Message 相关测试不得回归。
- **R-8 治理**：属 §9 已登记的 `components/fairy/` 模块（ARCHITECTURE §9 预告 FairyAvatar, expressions 之一致落地），无 ARCHITECTURE/API_CONTRACT/PROJECT_STATUS 契约面变更；实现记录写入 Trellis journal 收尾。

## 待决问题定稿（ grill-me 4 问，按推荐默认 + approved 需求文档）

1. **表情集合 = 最小四态**（idle/thinking/speaking/happy），不加「出错」态——错误已有 ChatPage 顶部错误条承载，表情不含错误语义，避免过度设计。
2. **动画 = 纯 CSS keyframes，放独立 `expressions.css`**（随组件 import，Vite 原生支持；测试用文件静态断言 + matchMedia 桩双路覆盖），不引 framer-motion。
3. **挂载 = (a)+(b) 都做**：ChatPage 头部主形象参与表情状态机，Fairy 消息行小头像为静态点缀；MessageStream 改动限制在 Fairy 行加一个 `<FairyAvatar size="sm" />`，不动消息渲染其余逻辑。
4. **视觉 = 纯 CSS/SVG 自绘**（需求文档「形象设计依据」节已定稿）：脸不用 🧚 emoji；不提交米哈游原画/建模素材。

## Acceptance Criteria

- [ ] AC-1：聊天页头部可见 Fairy 形象（SVG 自绘非 emoji），默认待机表情带呼吸动画，非占位死代码
- [ ] AC-2：发送消息后至首个 token 显示思考表情；流式输出中切说话表情；done 回待机（单测断言状态接线）
- [ ] AC-3：`borrow` 成功事件后约 2 秒显示开心表情再回待机；失败/无库存事件不触发开心
- [ ] AC-4：`prefers-reduced-motion: reduce`（matchMedia 桩）下无动画类、SVG 静态渲染且表情仍可区分；`expressions.css` 含同义 media 兜底
- [ ] AC-5：双 dev server 真机可见表情随对话状态切换；web 全量测试 + web typecheck + `pnpm lint` + prettier（`--end-of-line auto`）通过；`package.json` 无变化（零新依赖）

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

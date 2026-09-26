# 真机验收记录：Fairy 拟人化形象与表情切换

- 日期：2026-09-25 · 环境：api :3000 + web :5173 双 dev server，Neon 开发库，DEEPSEEK 真实 LLM
- 方式：浏览器 DOM / 计算样式断言（IAB 自动化），不使用截图

## 结果

| 断言                                                        | 结果 | 证据                                                                                                                                                                    |
| ----------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 头部头像默认 idle，`role="img"`，aria-label「Fairy 待机中」 | ✅   | DOM: `data-expression="idle"`, `aria-label="Fairy 待机中"`                                                                                                              |
| SVG 实际渲染尺寸 72px（lg），5 个 SVG 部件                  | ✅   | `boundingBox 72×72`；parts: ring / wings / dress / eyes / mouth-idle                                                                                                    |
| 浮动动画生效                                                | ✅   | `computed animation: fairy-float 3.6s`                                                                                                                                  |
| 发送消息后 thinking → speaking → idle 链路                  | ✅   | 采样序列: thinking@7ms → speaking@8116ms → idle@10489ms                                                                                                                 |
| Fairy 消息行挂载装饰性头像（aria-hidden）                   | ✅   | `[data-testid="fairy-avatar-decorative"]` ×1，`aria-hidden="true"`                                                                                                      |
| 借阅成功后出现 happy，约 2s 后回 idle                       | ✅   | thinking@3ms → speaking@8602ms → happy@10932ms → idle@12972ms（happy 窗口 ≈2.04s，对应 `FAIRY_HAPPY_DURATION_MS=2000`）                                                 |
| happy 态 aria-label 与部件                                  | ✅   | aria-label「Fairy 心情很好」；parts: ring / wings / dress / eyes-happy / mouth-happy / sparkles；`class="fairy-avatar-svg fairy-float fairy-blink fairy-avatar--happy"` |

## 备注

- 真机同时完成两笔借阅（卡片借阅按钮 5→3），celebrate 均触发，无报错条。
- IAB 后端对点击类 Playwright locator 持续超时（`getByRole("button")` / `locator("#chat-input")` click 均 3s 超时，`fill()` 也不进 React 受控状态）。改用原生 setter + `input` 事件设置输入、DOM `click()` 提交后链路全部正常——属自动化工具限制，非产品缺陷。
- 视觉外观（脸型、发型、女仆装配色）按需求文档「形象设计依据」以自绘 CSS/SVG 落地，未使用 HoYoverse 素材；真机未做美术走查（无视觉验收人），组件测试已锁定各表情 SVG 部件集合。

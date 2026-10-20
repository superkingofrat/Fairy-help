# Fairy 功能测试指南（手工验收）

本文档是本地功能测试（手工验收）的执行清单，按 S0 冒烟 → S1 用户主链路 → S2 管理端 → S3 负面边界四级组织。每项都给出操作步骤与预期结果，可直接照着逐条勾选。

> 建议：纯手工点页面验收不需要开思考模式；如果验收中撞到失败要跨 api/web/shared 定位根因，再开（AGENTS.md §3）。

---

## 0. 前置条件

### 0.1 启动

```bash
cd Fairy
pnpm dev        # turbo 同时拉起 api :3000 与 web :5173
```

**必须双进程**。`apps/web/.env` 的 `VITE_API_URL` 为空，前端走同源相对路径 `/api` 由 Vite 代理到 3000；只起 web 的话所有接口请求都会失败（AGENTS §9）。

启动前确认（AGENTS §15.4 联调 checklist）：

1. `pnpm --filter=@fairy/api dev` 与 `pnpm --filter=@fairy/web dev` 均在运行（或 `pnpm dev` 单进程编排）
2. `packages/database/.env` 与 `apps/api/.env` 的 `DATABASE_URL` 一致（当前已核验，指向同一 Neon 库）
3. 近期改过 `.env` 或 Prisma schema 时，已重启 API 并按需 `pnpm --filter=@fairy/database generate`

### 0.2 已核验的环境事实

| 项 | 状态 |
|---|---|
| 依赖安装 / 三份 `.env` | 就绪 |
| 迁移状态 | 12 个全部已应用，schema 与库一致 |
| `DEEPSEEK_API_KEY` | 已配置（对话走真实 LLM） |
| `AMAP_SERVER_KEY` / `VITE_AMAP_JS_KEY` | 已配置（地图坐标链路完整） |
| `OPENAI_API_KEY` / `EMBEDDING_API_KEY` | **未配置**（影响见 §6 已知非缺陷） |
| 3000/5173 端口 | 启动前无占用 |

### 0.3 测试账号矩阵

| 账号 | 口令 | 角色 | 用途 |
|---|---|---|---|
| `user@fairy.local` | `user123456` | agent | 用户侧全链路 + 旅行规划 |
| `admin@fairy.local` | `admin123456` | admin | 管理端 + 对话问数 |
| `<slug>@fairy.local` | `user123456` | user | 46 个 persona 演示账号（如 `soldier11@fairy.local`），各带画像与 3 条记忆 |
| 现场注册 | 自设 | user | 注册闭环与越权对照 |

**个性化推荐对照实验**（同一个问题、两个偏好相反的 persona，推荐结果应不同）：

- `billy@fairy.local` — 偏好动作/冒险
- `norma@fairy.local` — 偏好科幻/动画

---

## 1. S0 冒烟（约 5 分钟，先跑这组再往下走）

| # | 操作 | 预期结果 |
|---|---|---|
| T0-1 | `curl http://127.0.0.1:3000/health` | 200，`{code:"OK",data:{status:"healthy"},msg:"ok"}` |
| T0-2 | POST `/api/auth/login`（`user@fairy.local`，见附录命令） | 200，返回 `token` / `refreshToken` / `user`（role=agent） |
| T0-3 | 浏览器开 `http://localhost:5173` | 跳转 `/login`，页面正常渲染（代理通了） |
| T0-4 | 用 T0-2 的 token 请求 `GET /api/movies` | 200，返回影片列表（当前库 8 部，以实际为准），每条含 `genres`、`stock` 等字段 |
| T0-5 | 登录 user 账号进入 `/chat` | 正常进入对话页，无白屏/控制台报错，Fairy 头像待机中 |

---

## 2. S1 用户主链路（登录 `user@fairy.local`）

### 2.1 对话、推荐与台词

1. 发送「想看部治愈的片子」→ 应返回至少一张推荐卡片（RecommendationCard），卡片展示片名、封面、库存。
2. 库内有台词的影片，卡片上应渲染**斜体台词小字**；回复中引用的台词必须与库内 `quote` 逐字一致，不得出现编造台词。
3. 观察 Fairy 头像状态流转：发送后 `thinking` → 流式回复中 `speaking` → 结束后回到 `idle`；SSE 在浏览器 Network 面板可见逐 chunk 输出（真流式，非一次性返回）。

### 2.2 借还与库存

> 借还类测试集中在同一部影片上，方便核对库存加减。

4. 点推荐卡片上的借阅按钮 → 成功提示；**Fairy 头像切到 happy 约 2 秒**后回落 idle；页面「我的借阅」条出现该片。
5. 刷新页面后该影片在「我的借阅」中仍在（数据落库，非仅前端状态）。
6. 在对话里发送归还意图（如「我把这部还了」）→ 库存回补，借阅条消失。
7. 再借一次后，直接点卡片上的归还按钮（`stock = 0` 时该按钮也应可用）→ 归还成功。
8. 影片库页 `/movies`：分页、mood/scene 标签筛选、关键词搜索；直接借阅按钮；已借影片卡片置灰显示「已借」且跨页一致。**库页没有归还按钮**（归还只走 chat / 借阅条链路，属既定设计）。

### 2.3 会话与历史

9. 左侧会话栏新建会话、切换会话；刷新浏览器后回到该会话，历史消息完整回放（文本 + 推荐卡片 + 借阅事件走同一渲染路径）。

### 2.4 记忆中心

10. 在会话 A 说「我喜欢科幻片」→ 点 chat 头部「Fairy 记住了什么」打开只读面板，应出现新的 preference 记忆（标注「对话抽取」）。
11. **新建会话 B**，问「按我的喜好推荐一部」→ 回复应引用该偏好（跨会话记忆复用，证据是与空偏好推荐结果不同）。
12. 在面板内翻页/确认来源标注：`sessionId` 非空为「对话抽取」，为空为「系统录入」（46 个 persona 的系统录入记忆即后者）。

### 2.5 个性化（persona 对照）

13. 分别登录 `billy@fairy.local` 与 `norma@fairy.local`，问同一句话（如「推荐部片子」）→ 两次推荐结果应体现各自 `likeGenres` 差异（动作/冒险 vs 科幻/动画）。

### 2.6 旅行规划（仅 agent/admin 角色）

14. 进入 `/trips`，创建行程（如「上海 2 天」）→ 应生成时间线行程；POI 有坐标时地图应渲染标记点与折线（key 已配全，正常应出图）。
15. 刷新/重新进入 `/trips` → 历史行程列表按创建时间倒序，可回看详情时间线。

### 2.7 注册闭环（可选）

16. `/register` 注册新账号 → 注册即登录进入 `/chat`；重复邮箱应提示「该邮箱已注册」（409 `EMAIL_ALREADY_EXISTS`）；短密码/两次不一致应被前端校验拦住。

---

## 3. S2 管理端（登录 `admin@fairy.local`）

17. `/admin/movies`：新增影片。心情/场景**必须点选标签**，否则错误应显示在弹窗内；封面空串、年份传字符串、总库存 < 可借库存都应被拒。
18. `/admin/profiles`：列表按用户展开；编辑画像（如 `likeGenres`）；补建已存在画像应 409 `PROFILE_ALREADY_EXISTS`；该资源无删除入口（既定设计）。
19. `/admin/behavior`：行为流水分页 + 动作筛选；刚产生的 BORROW / RETURN / RECOMMEND 流水应可见。
20. `/admin/insights`：热门影片 TOP 5、14 天借阅/归还趋势（缺日补 0）、低库存（`stock ≤ 1`）、mood/scene 30 天分布；空数据时应有对应空态而非报错。
21. 建议流（内嵌在 insights 页）：未读徽标计数、单条/全部已读、「立即生成日报」当天两次返回同一条（幂等）。
22. 阈值异常检测：把某部影片库存改成 1 → 重启 API（阈值周期启动即跑一次）→ 建议流出现该片 `LOW_STOCK` 条目；回补库存后再跌破会重新出条。
23. 对话问数：admin 在对话里问「最近什么片最火」→ 返回看板同源真实数字；改用普通 user 账号问同样问题 → 友好拒绝且不暴露数据。
24. `/admin/memories`：给某用户新增一条记忆（如「喜欢太空题材」）→ 用该账号新建会话提问 → 回复应引用这条**手动录入**的记忆（与 LLM 抽取同库同链路）；再测试编辑、删除。
25. 权限矩阵：普通 user 直接访问 `/admin/*` 页面 → 前端跳回首页；裸调 admin API → 403 `FORBIDDEN`。

---

## 4. S3 负面与边界

26. 匿名（无 token）访问 `/api/movies`、`/api/memories` 等 → 401。
27. 行程门禁：普通注册 user 在对话里要求规划行程、或裸调 `POST /api/trips` → 403 `TRIP_FORBIDDEN`，且 DB 中**不产生 Trip 记录、无行为日志**。
28. 越权读取：用户 A 的会话 id / 行程 id 用用户 B 的 token 访问 → 会话跨用户 403 `SESSION_FORBIDDEN`，行程越权统一 404 `TRIP_NOT_FOUND`（故意不暴露存在性）。
29. 库存边界：某部影片 `stock = 0` 时借阅 → 409 `OUT_OF_STOCK`；同一用户重复借同一部 → 409 `ALREADY_BORROWED`。
30. 限流（可选，会占用限额窗口，放最后做）：chat 第 31 次/分钟 → 429 `TOO_MANY_REQUESTS`（前 30 次正常）；login 第 11 次/15 分钟 → 429。触发后等窗口过去，别影响后续账号登录。

---

## 5. 已知「非缺陷」——看到这些现象不要当 bug 报

| 现象 | 原因与处置 |
|---|---|
| 记忆检索是结构化兜底（时间倒序），不是语义相似召回 | `OPENAI_API_KEY` 空且 `EMBEDDING_API_KEY` 未配置，按设计降级；落库、注入、自查全正常。这是登记在案的 FU-16 待验收项 |
| 首次请求很慢或 P1001「Can't reach database server」 | Neon 冷启动；重试一次即可，别判「接口全坏」 |
| chat 每轮约 2-3 次 LLM 调用，回复有 1-3 秒延迟 | 真实供应商延迟，非卡死 |
| web 能开但接口全失败 | 只起了 web 单进程，见 §0.1 |
| 日报/建议时间不符合预期 | 按服务器本地 08:00 触发（`TZ=Asia/Shanghai`） |

---

## 6. 通过标准

- **S0 全过 + S1 全过 + S2/S3 无 P0/P1 级失败**，方可判定本次功能测试通过。
- P0：服务不可用、数据错误（库存/租约/画像与预期不符）、已批准功能被阻塞。
- P1：非阻塞问题（文案、空态、联调 UX），登记后可按 §15.2 流程处理。
- 测试过程发现的问题注明：功能编号、复现步骤、账号、截图/接口返回。

## 7. 记录表（可复制填写）

| 编号 | 结果（通过/失败） | 备注（账号、复现步骤、返回码） |
|---|---|---|
| T0-1 ~ T0-5 | | |
| S1 对话推荐/台词 | | |
| S1 借阅/归还/库存 | | |
| S1 会话与回放 | | |
| S1 记忆沉淀与跨会话引用 | | |
| S1 persona 个性化对照 | | |
| S1 旅行规划与地图 | | |
| S2 影片/画像/流水 | | |
| S2 看板与建议流 | | |
| S2 对话问数权限 | | |
| S2 记忆管理 | | |
| S3 越权与边界 | | |

---

## 附录：curl 冒烟命令

```bash
# 健康检查
curl http://127.0.0.1:3000/health

# 登录（Git Bash 下 body 含中文时改用 --data-binary @文件，避免乱码）
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@fairy.local","password":"user123456"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.token))")

# 带 token 取影片库
curl -s http://127.0.0.1:3000/api/movies -H "Authorization: Bearer $TOKEN" | head -c 400
```

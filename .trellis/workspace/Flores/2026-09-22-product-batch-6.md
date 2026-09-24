# 2026-09-22 产品修复批次（批次 6）会话记录

分支 `chore/reliability-fixes`（基于 master `c71c135`，未推送）。4 个提交：`19da2df`、`4b18057`、`0db19a2`、`8c20656`。范围经负责人「继续」确认（路线图批次 6，三项各自独立提交），均属 AGENTS §15.2 P1 豁免。

## 本轮完成

### 1. `19da2df` api: gate trip planning on agent role instead of profile name

- `toolDispatcher.dispatch(plan, userId, role, message?)` 的门禁从「画像名 == 铃」硬编码改为 `role ∈ {admin, agent}`；`profile` 形参与 `Profile` import 一并删除（根 tsconfig `noUnusedParameters` 会留一具死参数），`stateLoop` 调用点同步（画像仍用于 synthesize 调用）。
- `authMiddleware` 的 `Role` 联合新增 `"agent"`，JWT 校验显式枚举三分支——漏了这处会让 seed 改 role=agent 之后 agent 账号的 token 全部 401。
- seed 的 DEV_USER upsert **create/update 两分支都置 `role: "agent"`**：update 分支原本已带 `role: "user"`，只改 create 的话存量 dev 库重复 seed 不会迁移账号；两分支都改，重复 seed 即完成存量账号迁移。
- 测试 fixture 同步：`__tests__/helpers/auth.ts` 的 `TestRole` 加 `agent` + `USER_ID_BY_ROLE` 映射；`toolDispatcher.test.ts` 删 `agentProfile` fixture、三个 trip 用例改 `dispatch({ tool: "trip" }, "user-1", "agent", ...)`、forbidden 用例改名强调「普通用户不调工具」；`chat.test.ts` 的 trip SSE 用例改 `authHeader("agent")`。
- 设计取舍：注册仍只签 `user` 角色（契约响应形状不变）；shared 的 `role: z.string()` 保持宽松（web 不按 agent 分支，收窄只会无谓破坏契约）；admin/insight 门禁不动。

### 2. `4b18057` api: keep travel-genre and mood-borrow questions out of trip and unresolved intents

- `isPlanTripByRules` 增加 `MOVIE_NOUN_PATTERN` 守卫（片子/影片/电影/短片/纪录片/碟片/录像带）：消息含影片名词时旅行词只是题材修饰，「有没有旅行为主题的片子」规则不命中、交 LLM 判定，不再误入行程婉拒。关键词表同时去掉「规划」单字（「规划一下库存」属运营语境，交由 LLM/insight 判定）。
- 借分支在 **insight 判定之后**内嵌 `parseMoodsAndScenes` 检查：有心情/场景词 → `recommend`（「想借个治愈的片子」），都没有才 `borrow_unresolved`。顺序是关键：insight 在前保住「最近借阅情况」→ trend 的既有回归。
- `INTENT_SYSTEM_PROMPT` 的 plan_trip 行补反例（「有没有旅行为主题的片子」应判 recommend），规则层与模型层双保险。
- 测试：`intentClassifier.test.ts` 新增 2 例（心情借阅 → recommend 治愈；影片题材 → unmatched 且 tryChat 被调用）+ `isPlanTripByRules` describe 6 例（3 真 3 假）。

### 3. `0db19a2` web: normalize chat and API errors to localized messages

- `http.ts` 重构：抽出 export `fetchResponse`（fetch 包装 `NETWORK_ERROR`）与 `readEnvelope`（401 → `UNAUTHORIZED`；非 2xx 带 `payload.code ?? REQUEST_FAILED`；非 JSON → `INVALID_RESPONSE`；空体 → `EMPTY_RESPONSE`）；`rawRequest` 与 `requestInner` 两条入口共用。英文开发提示保留在 `message` 上供排障，但码稳定，组件层只按码显示。
- `chatApi.ts`：删自己的 `API_BASE` 改 import `fetchResponse`；新增 `parseChatError` 解 SSE 开启前的后端错误信封，非 401 → `ApiRequestError(msg ?? "Chat failed (status)", code ?? "CHAT_FAILED")`；无响应体 → `EMPTY_STREAM`；读循环顶部 `timedOut` → `TIMEOUT`；`reader.read()` 单独 try：`timedOut` 归一 `TIMEOUT`、调用方 `signal.aborted` 原样抛、其余 `STREAM`。`onEvent` 回调内的错误**故意不包装**（消费者错误原样传播，避免吞业务异常）。401 → 单飞刷新 → 重试链路不变。
- `lib/errorMessages.ts`（新）：`errorCode` 走 `instanceof` + duck-type 双路；`CHAT_ERROR_KEYS`（4 个契约码 + `CHAT_FAILED` + 4 个链路码）与 `COMMON_ERROR_KEYS`（传输层合成码 + `UNAUTHORIZED`）两张表；`localizedErrorMessage`（已知码 → i18n；未知码 → `error.message` 即后端中文 msg；兜底 key）与 `chatErrorMessage`（先对话码表再委托）。
- 十处组件接入：`ChatPage`（`chatErrorMessage`）、`LoginPage`/`RegisterPage`、`BehaviorPage`/`InsightsAdminPage`/`MemoryAdminPage`（4 处）/`MoviesAdminPage`（3 处）/`ProfilesAdminPage`（2 处）、`MovieLibraryPage`（加载 + borrow 链尾——堵住借阅卡上 `NETWORK_ERROR` 英文直出的最后一处泄漏）。每处保留原兜底 key。
- i18n：`chat.error.timeout` 更名为 `chat.error.TIMEOUT`（原名从未被翻译消费，超时时这个 key 字面量会被原样上屏——本轮顺带修掉），补 5 个 `chat.error.*` 与 5 个 `error.*`。
- 测试：`chatApi.test.ts` 两条 auth 断言改 `.rejects.toMatchObject({ name: "ApiRequestError", code: "SESSION_EXPIRED" })`；429 用例保留 msg+code 断言；新增非信封、空流、中断流、超时 4 例 + `hangingSseResponse`/`erroringSseResponse` 两个 helper；`errorMessages.test.ts` 新建全量覆盖；`ChatPage.test.tsx` 新增错误展示 1 例（`TIMEOUT` → 「对话超时，请重试」+ 乐观空气泡回滚后用户消息仍在）。

### 4. `8c20656` docs: sync spine for the product fixes batch

- API_CONTRACT §3.7 三处：trip 门禁改角色表述（按 token `role` 判定、seed 账号为 agent、新注册默认 `user`）；意图顺序补影片名词守卫与心情回落注记；新增「前端错误展示」消费方约定（契约码→`chat.error.*` 本地化、传输层合成码为前端内部码不对应任何后端响应）。
- ARCHITECTURE §8：行程门禁行整行重写（画像名硬编码失效史 + role 免迁移理由）、plan_trip 关键词行补守卫与去「规划」、借/还分支行补心情回落注记、新增「前端错误按 code → i18n 映射」决策行。
- PROJECT_STATUS：Completed Modules 顶部批次 6 条目、Next Steps 批次 6 标完成、Decisions 补 3 行、Last Updated 新条目。

### 验证

- api 344（33 文件）/ web 103（15 文件）/ shared 99 全绿；`pnpm run ci`（lint → typecheck → test → build）5/5 任务通过；prettier `format:check` 通过。
- 无新端点、无 DB 迁移、契约响应形状不变（§3.7 仅行为注记）。

## 踩坑记录

1. **续接会话注入的 Read 快照同样可能是旧版本**：本章节注入的多份组件快照全是 6c 改前代码（`error.message` 直出版本），差点按错误基线重复修改。动手前必须先 `git diff --stat HEAD` + grep 校验磁盘真实状态，快照只当历史记录看。（与上轮会话同一坑，第二次踩。）
2. **删参数触发 `noUnusedParameters`**：`dispatch` 的 `profile` 形参与 `Profile` import 必须同时删，只删调用点会让根 tsconfig 的 typecheck 直接失败。
3. **`chatApi` 改用 `fetchResponse` 后 `API_BASE` 成未使用常量**：tsc TS6133 + eslint 双报——第一轮 typecheck/lint 就是抓这个，改完即过。凡是「搬用别处能力」的重构，先想原模块的私有常量是否变成死代码。
4. **jsdom 里超时 AbortError 的传播路径**：setTimeout 触发 abort 后，pending 的 `reader.read()` 才 reject。流错误归一的顺序必须**先判 `timedOut` 再判调用方 abort**——反了会把超时误报成「调用方取消」。测试侧第一版 helper 在 `start(controller)` 里自成 AbortController，拿不到请求 signal，abort 永远不触发 5 个用例全挂；改成 `init?: RequestInit`、在 stream start 里注册 `init.signal` 的 abort 监听才复现真实路径。
5. **脊柱文档 Edit 的 old_string 不要手抄长段**：本次更新 PROJECT_STATUS 时把 `SSR/jsdom` 抄成 `SSR/jsdb`，整段匹配失败；改用「标题 + 首条 bullet 短前缀」做锚点分段插入，短且唯一。

## 未完成 / 后续

- **`classifyIntent` 的历史注入不走 token 预算裁剪**（已登记 PROJECT_STATUS 风险）：意图分类每轮固定带上限 ~20k 字符历史，属成本关注，仍未处理（下批 P1 候选）。
- **批次 7（落地件）**：Dockerfile（api+web，显式 `TZ=Asia/Shanghai`）+ 部署清单、seed 加 `NODE_ENV=production` 防护、真实库并发集成测试（`fairy_test`，默认跳过、配 `TEST_DATABASE_URL` 才跑，20 并发 borrow 断言不超卖）、`docs/prompts.md` 填充、README 补全 prisma generate/migrate/.env 步骤。执行前与负责人确认。
- 真实库 seed 迁移验证：本轮的 seed role 变更只跑了单测与静态核对，存量 dev 库需在下次 `pnpm --filter=@fairy/database db:seed` 时确认 `user@fairy.local` 变为 agent 后行程规划可用（账号已存在时走 update 分支）。
- 全部提交在本地分支 `chore/reliability-fixes`，**未推送**（推送需负责人明确指示）。

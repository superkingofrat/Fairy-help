## Context

See `proposal.md` and the approved requirements doc. Phase 2 pinned the orchestration boundary (`IntentClassifier → Planner → ToolDispatcher → ResponseSynthesizer`, SSE event names unchanged); FU-2 replaces classifier/synthesizer internals and builds `packages/ai-sdk` from zero. Existing route tests (`chat.test.ts`) mock only services and exercise the real agent — with no key in the test environment the LLM path must short-circuit so those tests stay green unchanged.

## Goals / Non-Goals

**Goals:**

- One dependency-free SDK package: three providers behind one interface, typed errors, usage metadata.
- LLM as primary for intent + reply text; Phase 2 rules/templates intact as fallback; degradation invisible to route and web.
- Hermetic tests: mock at the `llmClient` boundary (agent) and `fetch` boundary (SDK); CI never calls vendors.

**Non-Goals:**

- Consuming `stream()` in the route (interface + implementation only), session history, embeddings retrieval, cost dashboards.

## Decisions

1. **Pure fetch adapters; drop the unused `openai` dependency**  
   Why: DeepSeek and OpenAI share the OpenAI-compatible REST shape (base URL + key differ), Claude is one POST; uniform adapters make timeout (AbortController) and mocking (`vi.stubGlobal("fetch")`) trivial and add zero vendor SDK lock-in.  
   Alternative: vendor npm clients — heavier, three mocking styles.

2. **Provider defaults: deepseek `deepseek-v4-flash`, openai `gpt-4o-mini`, claude `claude-3-5-haiku-latest`**  
   Why: user chose deepseek-v4-flash as the chat default; the other two need sane cheap defaults for when they are selected. All overridable via `AI_MODEL`.

3. **Agent consumes a cached `llmClient` with `tryChat → ChatResult | null`**  
   Why: one place owns factory creation, key detection, timeout, input sanitization, and usage logging; `null` return is the universal degradation signal — classifier/synthesizer stay simple and the route never learns about providers.

4. **Intent = one low-budget LLM call; reply = one grounded call (≤2 per turn)**  
   Why: intent needs only JSON (`max_tokens` small, temperature 0); reply synthesis needs observation + profile. movieId path and chitchat tool path avoid extra calls where possible.

5. **Intent JSON validated with zod; enums filtered server-side**  
   Why: LLM output is untrusted; schema mismatch → rule fallback. `moods`/`scenes` intersected with `MOODS`/`SCENES`; borrow carries only a title string resolved via `listMoviesForTitleMatch` (unique → borrow, else borrow_unresolved).

6. **`chitchat` flows as `{ tool: "none", reason: "chitchat" }`**  
   Why: reuses the none-observation shape; synthesizer branches on reason to give the LLM a persona-only prompt. Rules never emit chitchat, so fallback behavior is unchanged.

7. **`synthesize` becomes async with context (`message`, `profile`)**  
   Why: reply grounding needs both; `stateLoop` fetches the profile once and shares it. Tools keep loading the profile for ranking independently.

8. **Usage via `recordUsage(source, usage)` → single structured log line per LLM call**  
   Why: §5 minimum; per-user aggregation belongs to BehaviorLog work (FU-3+).

## Risks / Trade-offs

- [LLM adds latency to every non-movieId turn] → low max_tokens on intent, `AI_TIMEOUT_MS` (default 20s), full fallback keeps the product usable during outages.
- [Two vendors share one adapter] → a vendor breaking the OpenAI-compatible shape is config-level (base URL) before it is code-level.
- [Route tests depend on "no key in CI"] → SDK tests stub fetch; agent tests mock `llmClient`; a developer with a real key in shell env would still not break suites because suites mock at one of those two boundaries.

## Migration Plan

- Deploy API with new env; behavior without keys is identical to Phase 2 (fallback). Adding `DEEPSEEK_API_KEY` flips the chat path live with no other change.
- Rollback: unset `AI_PROVIDER`/keys → rules/templates only.
- Docs: `API_CONTRACT.md` §3.7 gains an LLM/degradation note (no shape change); `ARCHITECTURE.md` AI integration section names the provider factory and fallback path.

## Open Questions

None blocking; DeepSeek v4-flash context window/pricing confirmed during联调 (all config is env-driven).

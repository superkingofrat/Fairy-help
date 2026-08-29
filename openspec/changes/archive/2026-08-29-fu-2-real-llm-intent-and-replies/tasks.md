## 1. SDK foundation (`packages/ai-sdk`)

- [x] 1.1 Types + errors: `AiProvider` interface, `ChatMessage`/`ChatResult`/`UsageMetadata`/`StreamChunk`/`EmbedResult`, `AiProviderError` with stable codes (`MISSING_API_KEY`, `UNKNOWN_PROVIDER`, `TIMEOUT`, `HTTP_5XX`, `RATE_LIMITED`, `PARSE`, `EMBED_UNSUPPORTED`)
- [x] 1.2 OpenAI-compatible chat adapter (serves `deepseek` + `openai` via config), Claude adapter, `embed()` (OpenAI only; others typed `EMBED_UNSUPPORTED`)
- [x] 1.3 `stream()` SSE parsing for both adapter families (chunks then final usage)
- [x] 1.4 Factory from env: `AI_PROVIDER` (default deepseek), per-provider model defaults, keys, base URLs, `AI_TIMEOUT_MS`
- [x] 1.5 Remove unused `openai` dependency; SDK unit tests with mocked `fetch` (request shape, usage parse, stream parse, typed errors)

## 2. Agent integration (`apps/api/src/agent`)

- [x] 2.1 `llmClient`: cached provider from env, `tryChat` → `ChatResult | null` on any failure, input sanitization, structured usage logging
- [x] 2.2 `usage.ts`: minimal `recordUsage(source, usage)`
- [x] 2.3 `intentClassifier`: LLM structured intent (zod-validated, title→title-match resolution, chitchat) with rule fallback preserved verbatim; `planner`/`toolDispatcher` chitchat passthrough
- [x] 2.4 `responseSynthesizer`: async LLM grounded reply (message + profile + observation) with template fallback; `stateLoop` passes context and shares one profile read

## 3. Tests and docs

- [x] 3.1 API tests: classifier LLM/fallback/chitchat, synthesizer grounding/fallback; existing route suite stays green with no key configured
- [x] 3.2 `.env.example`: register `AI_PROVIDER`, `AI_MODEL`, `DEEPSEEK_API_KEY`, `AI_TIMEOUT_MS` (placeholders only)
- [x] 3.3 `API_CONTRACT.md` §3.7 LLM behavior + degradation note; `ARCHITECTURE.md` AI integration layer + provider factory
- [x] 3.4 Run `pnpm --filter=@fairy/ai-sdk test`, `@fairy/api test`, `@fairy/web test` and typecheck for touched packages

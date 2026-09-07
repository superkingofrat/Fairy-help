# ai-provider Specification

## Purpose

Wraps vendor LLM APIs behind one dependency-free interface so consumers use chat/stream/embed with vendor-neutral usage metadata and typed failures, confining vendor specifics (request shapes, SSE parsing, error classes) to this package.
## Requirements
### Requirement: Unified provider interface with usage metadata
`packages/ai-sdk` MUST expose one provider interface with `chat()`, `stream()`, and `embed()`. `chat()` MUST return the generated text plus vendor-neutral token usage metadata (`promptTokens`, `completionTokens`, `totalTokens`, each nullable). `stream()` MUST yield text chunks followed by a final chunk carrying the same usage metadata. `embed()` MUST be present on every provider; a provider without an embeddings API MUST fail with a typed unsupported error rather than being absent. Vendor-specific HTTP details MUST stay inside this package.

#### Scenario: Chat returns text and usage
- **WHEN** a provider `chat()` call succeeds against a mocked vendor endpoint
- **THEN** the result contains the assistant text and usage metadata parsed from the vendor response

#### Scenario: Embed unsupported is typed
- **WHEN** `embed()` is called on a provider without an embeddings API
- **THEN** the call rejects with a typed error whose code identifies unsupported embedding, not an unhandled exception

### Requirement: Provider selection via environment
The SDK MUST select the provider from `AI_PROVIDER` (`deepseek` | `openai` | `claude`, default `deepseek`) and read the matching API key and optional base URL from environment variables. Each provider MUST have a documented default model (deepseek: `deepseek-v4-flash`). A missing API key MUST surface as a typed missing-key error at provider creation or first call, and MUST NOT fall back to another provider.

#### Scenario: Environment selects deepseek
- **WHEN** `AI_PROVIDER=deepseek` and `DEEPSEEK_API_KEY` are set
- **THEN** chat requests are sent to the DeepSeek endpoint with model `deepseek-v4-flash` unless `AI_MODEL` overrides it

#### Scenario: Missing key is typed
- **WHEN** the selected provider has no API key in the environment
- **THEN** provider creation or first call fails with the typed missing-key error and no request is sent

### Requirement: Typed failure semantics with timeout
All vendor HTTP failures, malformed responses, and timeouts (`AI_TIMEOUT_MS`) MUST surface as typed SDK errors carrying a stable code and MUST NOT leak vendor response bodies or stack traces to callers outside the package.

#### Scenario: Vendor outage is typed
- **WHEN** the vendor endpoint returns HTTP 500 or the request exceeds `AI_TIMEOUT_MS`
- **THEN** the SDK rejects with a typed error whose code distinguishes the failure class and whose message contains no vendor response payload

### Requirement: Optional embedding client decoupled from the chat provider

The SDK MUST be able to expose an `embed()`-capable client that is selected independently of `AI_PROVIDER`. When `EMBEDDING_API_KEY` (falling back to `OPENAI_API_KEY`) is set, the SDK MUST provide embeddings through the OpenAI-backed provider using `EMBEDDING_MODEL`, defaulting to `text-embedding-3-small` (1536 dimensions). When no embedding key is configured, the SDK MUST surface the embedding capability as unavailable — a degradation signal consumers can treat as "no embeddings" (for example `null`), NOT a typed missing-key failure — so that chat flows on providers without an embeddings API (e.g. `deepseek`) keep working unchanged. Providers that genuinely have no embeddings API MUST still fail `embed()` with the typed unsupported error rather than being treated as configured.

#### Scenario: DeepSeek chat with an embedding key

- **WHEN** `AI_PROVIDER=deepseek` with `DEEPSEEK_API_KEY` set, and `EMBEDDING_API_KEY` is also set
- **THEN** chat requests go to DeepSeek while `embed()` requests go to the OpenAI embeddings endpoint with model `text-embedding-3-small` unless `EMBEDDING_MODEL` overrides it

#### Scenario: Missing embedding key is a degrade signal

- **WHEN** neither `EMBEDDING_API_KEY` nor `OPENAI_API_KEY` is set while `AI_PROVIDER=deepseek` is configured
- **THEN** the embedding capability reports unavailable (no throw), and chat requests are unaffected


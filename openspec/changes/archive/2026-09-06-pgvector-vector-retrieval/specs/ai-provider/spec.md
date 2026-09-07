# ai-provider Specification

## Purpose

Wraps vendor LLM APIs behind one dependency-free interface so consumers use chat/stream/embed with vendor-neutral usage metadata and typed failures, confining vendor specifics (request shapes, SSE parsing, error classes) to this package. Chat provider selection follows `AI_PROVIDER`; embedding is an optional, independently configured capability that can be enabled even when the chat provider has no embeddings API.

## ADDED Requirements

### Requirement: Optional embedding client decoupled from the chat provider

The SDK MUST be able to expose an `embed()`-capable client that is selected independently of `AI_PROVIDER`. When `EMBEDDING_API_KEY` (falling back to `OPENAI_API_KEY`) is set, the SDK MUST provide embeddings through the OpenAI-backed provider using `EMBEDDING_MODEL`, defaulting to `text-embedding-3-small` (1536 dimensions). When no embedding key is configured, the SDK MUST surface the embedding capability as unavailable — a degradation signal consumers can treat as "no embeddings" (for example `null`), NOT a typed missing-key failure — so that chat flows on providers without an embeddings API (e.g. `deepseek`) keep working unchanged. Providers that genuinely have no embeddings API MUST still fail `embed()` with the typed unsupported error rather than being treated as configured.

#### Scenario: DeepSeek chat with an embedding key

- **WHEN** `AI_PROVIDER=deepseek` with `DEEPSEEK_API_KEY` set, and `EMBEDDING_API_KEY` is also set
- **THEN** chat requests go to DeepSeek while `embed()` requests go to the OpenAI embeddings endpoint with model `text-embedding-3-small` unless `EMBEDDING_MODEL` overrides it

#### Scenario: Missing embedding key is a degrade signal

- **WHEN** neither `EMBEDDING_API_KEY` nor `OPENAI_API_KEY` is set while `AI_PROVIDER=deepseek` is configured
- **THEN** the embedding capability reports unavailable (no throw), and chat requests are unaffected

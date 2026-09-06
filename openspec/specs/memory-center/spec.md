# memory-center Specification

## Purpose
Provides structured long-term memory for the chat agent: after each completed conversation turn, the system extracts memorable facts (preferences, facts, intents) from the dialogue via the LLM and persists them per profile; on the next turn the memory center retrieves the user's recent memories (isolated by `profileId`, limited count) and injects them into the prompt alongside the recent session history. All extraction and retrieval failures degrade silently so the chat experience is never blocked. Vector/embedding search and memory management UI are out of scope for this phase.
## Requirements
### Requirement: Extracted memories are persisted per profile

After a chat turn completes (SSE stream finished), the system MUST run an LLM extraction over that turn's user message and reply, producing zero or more memories each with a `kind` (`preference`, `fact`, or `intent`) and `content`. Each extracted memory MUST be persisted as a `Memory` row owned by the requesting user's `profileId`, with `sessionId` recorded when available. When extraction fails (LLM unavailable, timeout, schema-invalid output) the system MUST skip extraction silently: the chat response is unaffected, no error reaches the user, and the SSE `done` event still fires normally.

#### Scenario: Preference is stored after the turn

- **WHEN** a user tells the agent 「我喜欢科幻片」 in a chat turn
- **THEN** after the turn completes, a `Memory` row with `kind` preference and content mentioning 科幻 exists for that user's `profileId`, and the conversation reply was unaffected

#### Scenario: Extraction failure is silent

- **WHEN** the extraction LLM call fails or returns schema-invalid JSON
- **THEN** no memory is written, the chat turn's reply and SSE stream complete normally, and no error or stack trace is exposed

### Requirement: Retrieved memories are injected per user

When assembling the prompt for a chat turn, the system MUST retrieve the current profile's memories (filtered by `profileId`, optionally by `kind`, ordered by recency, limited to at most 5) and inject them as a memory block alongside the recent session history. The memory block MUST NOT leak another user's memories: retrieval is strictly scoped to the requesting `profileId`. The `TODO(memory-center)` plain-text fallback in `contextBuilder` MUST be replaced by this retrieval-based injection. When no memories exist, the prompt MUST simply omit the memory block without error.

#### Scenario: New session reuses a prior session's memory

- **WHEN** a user said 「我喜欢科幻片」 in an earlier session and opens a new session asking 「我喜欢什么类型的片子」
- **THEN** the prompt includes the stored memory and the reply reflects the 科幻 preference

#### Scenario: Memories are isolated by profile

- **WHEN** user A has a stored preference and user B sends a message
- **THEN** user B's prompt contains none of user A's memories

#### Scenario: No memories yields a clean prompt

- **WHEN** a profile has no stored memories
- **THEN** the prompt omits the memory block and the turn proceeds normally

### Requirement: Retrieval degrades without embeddings

The memory center MUST NOT depend on the `embed()` capability: retrieval uses structured filters (kind, recency, keyword containment) rather than vector search in this phase. When the embedding provider is unavailable or unused, the chat flow MUST work unchanged. In unit tests the extraction LLM and database MUST be mocked; real provider calls MUST NOT be made in CI.

#### Scenario: No embedding provider configured

- **WHEN** no OpenAI key (the only `embed()`-capable provider) is configured and a user chats with the agent
- **THEN** memory retrieval and injection still work via structured filters, and the turn completes with the normal stream shape


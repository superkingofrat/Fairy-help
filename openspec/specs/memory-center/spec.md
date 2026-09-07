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

When assembling the prompt for a chat turn, the system MUST retrieve the current profile's memories (strictly scoped by `profileId`, optionally prefilted by `kind`/`keyword`, limited to at most 5) and inject them as a memory block alongside the recent session history. Retrieval MUST prioritize semantic relevance: when an embedding client is configured and matching rows have embeddings, results MUST be ranked by ascending cosine distance (`embedding <=> :query`) with `kind`/`keyword` as prefilter; when vector recall returns fewer rows than the limit, the system MUST top up with structured results ordered by recency; when no embedding client is configured or no rows have vectors, retrieval MUST fall back to pure structured filters (kind, recency, keyword containment). The memory block MUST NOT leak another user's memories. When no memories exist, the prompt MUST omit the memory block without error.

#### Scenario: New session reuses a prior session's memory

- **WHEN** a user said 「我喜欢科幻片」 in an earlier session and opens a new session asking 「我喜欢什么类型的片子」
- **THEN** the prompt includes the stored memory and the reply reflects the 科幻 preference

#### Scenario: Memories are isolated by profile

- **WHEN** user A has a stored preference and user B sends a message
- **THEN** user B's prompt contains none of user A's memories

#### Scenario: No memories yields a clean prompt

- **WHEN** a profile has no stored memories
- **THEN** the prompt omits the memory block and the turn proceeds normally

#### Scenario: Semantic recall outranks recency

- **WHEN** an embedding client is configured, a profile has an older memory semantically close to the current topic and a newer unrelated memory, and the user's message concerns the topic
- **THEN** the older relevant memory is ranked ahead of the newer unrelated one in the injected block

#### Scenario: Short vector recall is topped up by recency

- **WHEN** an embedding client is configured but only a subset of a profile's memories have vectors (pre-backfill), and the vector recall returns fewer than 5 rows
- **THEN** the missing rows are filled with structured results ordered by recency, up to the injection limit

### Requirement: Retrieval degrades without embeddings

The memory center MUST NOT depend on the embedding capability: without an embedding client, on embedding failure, on dimension mismatch, or when no rows carry vectors, retrieval MUST use structured filters (kind, recency, keyword containment) exactly as before and the chat flow MUST work unchanged with the normal stream shape. In unit tests the extraction LLM, the embedding client, and the database MUST be mocked; real provider calls MUST NOT be made in CI.

#### Scenario: No embedding provider configured

- **WHEN** no embedding key (the optional embedding client, which falls back to `OPENAI_API_KEY`) is configured and a user chats with the agent
- **THEN** memory retrieval and injection still work via structured filters, and the turn completes with the normal stream shape

#### Scenario: Embedding failure at write time is silent

- **WHEN** a memory is being persisted but embedding generation fails or returns a non-1536-dimensional vector
- **THEN** the memory row is still persisted without an embedding, only a server log records the failure, and the chat turn is unaffected

#### Scenario: Embedding failure at retrieval time is silent

- **WHEN** the embedding call fails during a retrieval and a query is provided
- **THEN** retrieval falls back to structured filters and the turn completes with the normal stream shape

### Requirement: Memories receive embeddings at write time when embeddings are enabled

When an embedding client is configured, every newly persisted `Memory` row — whether extracted per chat turn or created by an admin through the memory management capability — MUST have an embedding generated from its `content` and persisted so it can later be recalled by semantic similarity. Embedding generation MUST use the same optional embedding configuration as retrieval (independent of the chat provider). A row whose embedding fails or is rejected (length not 1536) MUST still be persisted without an embedding, degrading to structured recall for that row.

#### Scenario: Admin-created memory is embedded

- **WHEN** an admin creates a memory via the management API while an embedding client is configured
- **THEN** the persisted row carries an embedding alongside `kind`/`content`, and it is recallable by semantic similarity on the next turn

#### Scenario: Chat-extracted memory is embedded

- **WHEN** the per-turn extraction persists a memory while an embedding client is configured
- **THEN** the row carries an embedding generated from its content

### Requirement: Existing memories can be backfilled idempotently

A standalone backfill script MUST embed `Memory` rows whose `embedding` is `NULL` using the same embedding client and raw persistence path, so rows written before embeddings were enabled become semantically recallable. The script MUST be idempotent and safe to rerun: it only selects rows without an embedding, and a failure on one row MUST NOT stop the remaining rows.

#### Scenario: Backfill run leaves the table fully embedded

- **WHEN** the backfill script runs against a table that has rows without embeddings and the embedding client succeeds
- **THEN** all rows end up with an embedding and the script prints per-run statistics

#### Scenario: Rerunning the backfill is a no-op

- **WHEN** the backfill script runs a second time after a fully successful run
- **THEN** no embedding call is issued for already-embedded rows and the script exits cleanly

### Requirement: Preference memories backfill profile likeGenres

After a chat turn's extraction persists at least one `preference` memory, the system MUST attempt to merge structured genre candidates (produced by the same extraction call, at most 3 per turn) into the user's `Profile.likeGenres`. The merge MUST be incremental (union + dedupe), MUST never remove or overwrite existing tags, MUST only accept candidates matching the movie library's distinct genre vocabulary (with dirty values such as blank or numeric-only strings excluded), and MUST run atomically and idempotently in a database transaction. The writeback MUST degrade silently: any failure (LLM unavailable, whitelist query failure, missing profile) never affects the chat response or memory persistence, and the feature MUST NOT expose any new public API endpoint.

#### Scenario: Recognized genre is merged without duplication

- **WHEN** a turn's extraction persists a preference memory with recognizable genre candidates including 科幻 and the movie library contains 科幻
- **THEN** the user's `Profile.likeGenres` gains 科幻 without duplicating any existing entry, and replaying the same turn leaves the array unchanged

#### Scenario: Unmatched candidates leave the profile untouched

- **WHEN** the extraction yields no `preference` memory, or its genre candidates do not match the library vocabulary
- **THEN** `Profile.likeGenres` remains unchanged

#### Scenario: Failures degrade silently

- **WHEN** the LLM is unavailable, or the whitelist query fails, or the profile is missing
- **THEN** the chat SSE flow and memory persistence are unaffected, no error reaches the user, and the skip is only logged


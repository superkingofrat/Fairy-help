# memory-center Specification

## Purpose
Provides structured long-term memory for the chat agent: after each completed conversation turn, the system extracts memorable facts (preferences, facts, intents) from the dialogue via the LLM and persists them per profile; on the next turn the memory center retrieves the user's recent memories (isolated by `profileId`, limited count) and injects them into the prompt alongside the recent session history. All extraction and retrieval failures degrade silently so the chat experience is never blocked. Vector/embedding search and memory management UI are out of scope for this phase.

## ADDED Requirements

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

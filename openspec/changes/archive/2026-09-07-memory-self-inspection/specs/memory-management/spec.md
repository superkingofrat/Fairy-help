# memory-management Specification

## Purpose
Provides an admin management surface over the `Memory` records written by the chat memory center (FU-14): admin-only REST endpoints to page through memories (filterable by user, kind and keyword), to create memories manually, and to edit or delete existing ones, plus an admin web page (`/admin/memories`) exposing the same operations. Management does not depend on the LLM or embedding provider; memories written by admins share the same table and retrieval/injection path as LLM-extracted ones. Vector/embedding search and user-facing self-inspection are out of scope for this phase.

## ADDED Requirements

### Requirement: Users can view their own memories read-only

The system MUST expose an authenticated `GET /api/memories/me` endpoint that returns a paginated list of `Memory` rows belonging **only** to the requesting user, where the owner is taken from the token (never from request parameters). Each item MUST contain `id`, `kind`, `content`, `sessionId` and `createdAt` and MUST NOT contain an email address, other users' data, metadata or embedding data. The endpoint MUST order by `createdAt` descending, support optional `page`/`limit`/`kind` and a `keyword` matched against `content`, and return `total` consistent with the filtered set. Requests without a valid token MUST be rejected with 401. Client-supplied `userId`/`email` parameters MUST be ignored. The chat page MUST offer the signed-in user a read-only self-inspection panel listing their own memories with a kind label and an origin label derived from `sessionId` presence (conversation-extracted vs system/admin-entered); the panel MUST handle loading, error and empty states and MUST NOT offer create, edit or delete.

#### Scenario: A user inspects her own memories from the chat panel

- **WHEN** the user 铃 opens the self-inspection panel in the chat page after Fairy has stored memories about her
- **THEN** the panel lists only 铃's own memories in descending time order, each with a kind label and an origin label — a memory written by conversation extraction (has a `sessionId`) is labelled 对话抽取 and a memory entered without a session is labelled 系统录入 — and the panel shows a proper empty state when she has no memories

#### Scenario: Only the owner's rows are returned

- **WHEN** the user 铃 calls `GET /api/memories/me` while memories for other profiles exist
- **THEN** the response contains only 铃's own rows (no other profile's content and no email field), and an anonymous request to the same endpoint is rejected with 401

#### Scenario: Filters apply within the owner's own scope

- **WHEN** 铃 calls `GET /api/memories/me?kind=fact&keyword=上海&page=1&limit=20` or passes an extra `userId` parameter
- **THEN** the response lists only her own `fact` memories whose content contains 上海 with `total` matching that filtered set, and the extra `userId` parameter has no effect on which rows are returned

# memory-management Specification

## Purpose
Provides an admin management surface over the `Memory` records written by the chat memory center (FU-14): admin-only REST endpoints to page through memories (filterable by user, kind and keyword), to create memories manually, and to edit or delete existing ones, plus an admin web page (`/admin/memories`) exposing the same operations. Management does not depend on the LLM or embedding provider; memories written by admins share the same table and retrieval/injection path as LLM-extracted ones. Vector/embedding search and user-facing self-inspection are out of scope for this phase.
## Requirements
### Requirement: Admin can list and filter stored memories

The system MUST expose an admin-only `GET /api/memories` endpoint returning a paginated list of `Memory` rows across profiles, each item containing at least `id`, `userId`, `email`, `kind`, `content`, `sessionId` and `createdAt`. The endpoint MUST support filtering by `userId`, by `kind`, and by a `keyword` matched against `content`, and MUST return `total` consistent with the filtered result, ordered by `createdAt` descending. Requests without a valid admin token MUST be rejected (401 anonymous, 403 non-admin) before any data is returned.

#### Scenario: Admin filters memories by keyword and kind

- **WHEN** an admin calls `GET /api/memories?kind=preference&keyword=科幻&page=1&limit=20`
- **THEN** the response lists only preference-kind memories whose content contains 科幻 for the requesting admin, with `total` matching that filtered set

#### Scenario: Non-admin is rejected

- **WHEN** a non-admin user calls `GET /api/memories`
- **THEN** the response is 403 with no memory data exposed

### Requirement: Admin can create, edit and delete memories

The system MUST expose admin-only `POST /api/memories` (create with `userId`, `kind`, `content`, optional `sessionId`), `PATCH /api/memories/:id` (edit `kind` and/or `content`) and `DELETE /api/memories/:id`. Creating a memory for a profile that does not exist MUST return 404 `PROFILE_NOT_FOUND`; editing or deleting an unknown id MUST return 404 `MEMORY_NOT_FOUND`; invalid bodies MUST return 400. A memory created or edited through these endpoints MUST be retrievable by the memory-center retrieval path used in chat injection.

#### Scenario: Admin adds a preference that later influences a reply

- **WHEN** an admin creates a `preference` memory for user 铃 with content 喜欢太空题材科幻片
- **THEN** the memory row is persisted, appears in subsequent `GET /api/memories` listings, and a later chat turn for 铃 is injected with it

#### Scenario: Admin deletes a mis-remembered fact

- **WHEN** an admin calls `DELETE /api/memories/:id` for an existing memory
- **THEN** the row is removed, later listings and chat injection no longer include it, and a repeated delete of the same id returns 404

### Requirement: Admin UI manages memories

The system MUST provide an admin-only web page at `/admin/memories` that lists memories with their user, kind, content, session and time, supports filtering and pagination, and offers create, edit (kind/content) and confirmed-delete interactions with loading, error and empty states, all user-facing text localized. Non-admin users MUST NOT be able to reach the page or its operations.

#### Scenario: Admin edits a memory from the page

- **WHEN** an admin edits a memory's content on the page and confirms
- **THEN** the change persists, is visible in the list after refresh, and non-admin navigation to `/admin/memories` is blocked

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


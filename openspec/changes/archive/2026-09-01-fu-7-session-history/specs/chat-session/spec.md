## Purpose

Fairy chat 对话持久化：每个用户的每段对话以会话为单位存入库中，可列表、回放、带最近消息上下文续聊，让「刷新即失忆、跨轮无记忆」成为过去。

## ADDED Requirements

### Requirement: Chat turns persist to a session

Every chat turn (the user message plus the assistant reply with its structured events) MUST be persisted to a session. A normal chat request MAY carry a `sessionId`; when omitted, the system MUST create a new session for the user and derive its title from the first message. A request referencing an unknown session MUST fail with `SESSION_NOT_FOUND`; a session owned by another user MUST fail with `SESSION_FORBIDDEN`. A deterministic return-action request MAY omit `sessionId` and MUST NOT require a session. The assistant reply's streamed text is stored as message content and its structured events (recommendation movie snapshot, borrow/return results) MUST be preserved for replay.

#### Scenario: Normal message with sessionId appends to that session

- **WHEN** a user sends a chat message with the `sessionId` of an existing session they own
- **THEN** the user message and the assistant reply (text + structured events) are stored under that session and the session's `updatedAt` refreshes

#### Scenario: Normal message without sessionId creates a session

- **WHEN** a user sends a chat message without a `sessionId`
- **THEN** a new session is created for that user with a title derived from the first message and the turn is stored in it

#### Scenario: Unknown session is rejected

- **WHEN** a chat message references a `sessionId` that does not exist
- **THEN** the request fails with `SESSION_NOT_FOUND` and no message is stored

#### Scenario: Non-owned session is rejected

- **WHEN** a chat message references a `sessionId` of a session owned by another user
- **THEN** the request fails with `SESSION_FORBIDDEN` and no message is stored

#### Scenario: Return action without a session

- **WHEN** a deterministic return action (`action: "return"`) request omits `sessionId`
- **THEN** the return executes through the existing deterministic path without requiring a session

### Requirement: Sessions are listable and replayable by owner

A user MUST be able to create an empty session, list their own sessions (most recently updated first, each with its message count), and fetch the full message history of one of their sessions in chronological order including structured event payloads. Session data MUST be owner-only: reading another user's session MUST fail with `SESSION_FORBIDDEN`, and unauthenticated requests MUST fail with `401`.

#### Scenario: Create an empty session

- **WHEN** a user creates a session
- **THEN** the API returns the new session with an empty title (filled on first message)

#### Scenario: List sessions most recent first

- **WHEN** a user requests their session list
- **THEN** the API returns only their sessions ordered by `updatedAt` descending, each with its message count

#### Scenario: Fetch a session's history

- **WHEN** a user requests a single session they own
- **THEN** the API returns its messages in chronological order with their structured event payloads

#### Scenario: Session access is owner-only

- **WHEN** a user requests a session owned by another user, or an unauthenticated request is made
- **THEN** the request fails with `SESSION_FORBIDDEN` (or `401` when unauthenticated) and no message data is returned

### Requirement: Chat continuation uses recent session history as context

When a chat turn continues an existing session, the last 10 stored messages (user and assistant, alternating) MUST be included in the intent classification and reply generation context so the agent can refer back to the earlier conversation. A session without prior messages MUST behave exactly like a fresh conversation, and the existing graceful degradation path (no LLM provider) MUST be unaffected.

#### Scenario: Continuation includes recent history

- **WHEN** a message continues a session that has prior messages
- **THEN** the last 10 messages are provided as context to intent classification and reply generation

#### Scenario: No history behaves as a fresh conversation

- **WHEN** a message is sent in a session with no prior messages
- **THEN** the turn is handled exactly like a fresh conversation with no history context

#### Scenario: Degradation is unaffected by history

- **WHEN** the LLM provider is unavailable and a session has history
- **THEN** the existing rule-based fallback handles the turn without the history context

### Requirement: Session history replays with interactive cards

The chat UI MUST be able to replay a session's history: user text, assistant text, recommendation cards (with working borrow/return controls), and borrow/return events render through the same path as live messages. A replayed session MUST persist across page reloads (re-fetched from the API).

#### Scenario: Replay renders the full history

- **WHEN** a user opens a session that has prior turns
- **THEN** all user texts, assistant texts, recommendation cards, and borrow/return events are displayed in chronological order

#### Scenario: Replayed cards stay interactive

- **WHEN** a user clicks borrow or return on a replayed recommendation card
- **THEN** the action executes through the chat channel and its result appears in the current session

#### Scenario: Reload restores the session

- **WHEN** a user reloads the page while a session is open
- **THEN** the same history is re-fetched and displayed

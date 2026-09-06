# agent-chat Specification

## Purpose

Provides the authenticated streaming chat entry so a user can send a message or structured borrow request and receive Fairy replies plus structured events without a blocking JSON body.
## Requirements
### Requirement: Chat uses SSE after a valid request body
The system SHALL accept `POST /api/chat` with JSON `{ message: string, movieId?: uuid, sessionId?: string }`. On success the response MUST use `Content-Type: text/event-stream`. Validation failures MUST return JSON `{ code, data, msg }` with `code` `VALIDATION_ERROR` and HTTP 400. The system MUST NOT expose a working `POST /api/borrow` business route in this change.

#### Scenario: Valid recommend message streams events
- **WHEN** an authenticated `dev-user` posts a message containing a known mood or scene label
- **THEN** the response is an event stream that includes at least one `text` event and, when in-stock matching movies exist, a `recommendation` event whose `items` length is between 1 and 5, followed by a `done` event

#### Scenario: Invalid body is JSON not stream
- **WHEN** the client posts a body that fails schema validation
- **THEN** the system returns HTTP 400 JSON with `code` `VALIDATION_ERROR` and does not start an event stream

### Requirement: Intent priority is movieId then title-borrow then tags then unmatched
The rule classifier — used as the fallback path when the LLM path is unavailable or fails — SHALL classify each request in this order: (1) valid `movieId` is borrow (no LLM call); (2) else if the message is a borrow-by-title request, resolve titles; (3) else if the message contains 「还」 AND exactly one catalog title matches, it is a return-by-title request; (4) else if the message contains at least one mood or scene enum label as a substring, it is recommend; (5) else unmatched. Unmatched MUST emit only guiding `text` and `done`, MUST NOT emit `recommendation` or `borrow`, and MUST NOT create rental or behavior-log rows.

#### Scenario: Unrecognized small talk
- **WHEN** the LLM path is unavailable and the user sends a message with no mood/scene label and no borrow intent (for example asking the weekday)
- **THEN** the stream contains guiding `text` mentioning mood/scene or card borrow, contains no `recommendation` event, and no new rental or behavior log is stored

#### Scenario: Return title under rule fallback
- **WHEN** the LLM path is unavailable and the message contains 「还」 with exactly one catalog title match (for example 「还千与千寻」)
- **THEN** the dispatch runs the return tool for that movie

### Requirement: Chat UI consumes the stream
The web app SHALL provide a `/chat` page that sends `POST /api/chat` with the logged-in user's identity (Bearer token from the auth store), renders streamed `text`, renders recommendation cards, and on card borrow resubmits the same endpoint with `movieId`. Chrome labels MUST come from the web locale files.

#### Scenario: Card borrow sends movieId
- **WHEN** the user clicks borrow on a recommendation card
- **THEN** the client posts `movieId` set to that movie's id on `POST /api/chat`

#### Scenario: Chat requires an authenticated session
- **WHEN** a visitor without a session opens `/chat`
- **THEN** the app redirects to `/login` instead of rendering the chat page

### Requirement: Intent understanding uses a real LLM with rule fallback

For messages without a valid `movieId`, the system MUST classify intent via an LLM structured output (JSON) validated against a schema, mapping non-enum phrasing onto the mood/scene enums (for example 「emo」→ 致郁, 「睡不着」→ 失眠夜) and onto the intent enum `borrow|return|recommend|store_insight|plan_trip|chitchat`. The LLM MUST NOT produce a `movieId`; borrow intent MUST carry a movie title resolved through the existing title-match service. Pure greetings or non-movie chatter MUST classify as `chitchat` and MUST NOT call tools. Any LLM failure (missing key, timeout, vendor error, schema mismatch) MUST fall back to the rule classifier with identical downstream behavior. For `store_insight` and `plan_trip`, the keyword rules MUST run BEFORE the LLM and short-circuit: when the rules classify the message as `store_insight` or `plan_trip`, the system MUST return that intent without calling the LLM, so spoken operational questions and trip-planning requests resolve deterministically regardless of model JSON reliability. Other intents remain LLM-first with the rules as fallback.

#### Scenario: Non-enum phrasing maps to enums

- **WHEN** the LLM classifies 「今晚有点 emo，想哭一场」 and returns moods including 致郁
- **THEN** the dispatch runs the recommend tool with validated mood/scene enums only

#### Scenario: Chitchat does not call tools

- **WHEN** the user sends 「你好」 and the LLM classifies it as chitchat
- **THEN** no recommend, borrow, or trip tool runs, no rental, behavior log, or `Trip` row is written, and the reply text is a natural greeting grounded only in the persona

#### Scenario: LLM failure falls back to rules

- **WHEN** the LLM call fails or returns schema-invalid output
- **THEN** classification falls back to the rule classifier and the resulting stream is indistinguishable in shape from the Phase 2 behavior

#### Scenario: Trip-planning phrasing short-circuits to plan_trip

- **WHEN** the user sends a trip-planning message matching the travel keywords (for example 「帮我规划周末去杭州玩」)
- **THEN** the intent is `plan_trip` without an LLM call and the trip planning tool runs

### Requirement: Reply text is LLM-generated and grounded with template fallback

The reply `text` content MUST be generated by the LLM from the tool observation facts (movie titles, stock, borrow outcome codes), the user's message, a profile summary, and — when the memory center has retrieved them — the user's stored memories; the LLM MUST NOT invent business facts beyond the observation and memories. On LLM failure the system MUST fall back to the Phase 2 template texts. `recommendation` and `borrow` event payloads MUST remain unchanged.

#### Scenario: Reply references only observed facts
- **WHEN** a recommend observation returns two movies and the LLM generates the reply
- **THEN** the text names at most the observed movies and does not fabricate stock numbers or unlisted titles

#### Scenario: Reply may reference a stored memory
- **WHEN** the memory center has stored a preference (for example 「喜欢科幻片」) for the current profile and the user asks what they like
- **THEN** the reply may reference that stored memory and MUST NOT invent preferences that are neither in the observation nor in the retrieved memories

#### Scenario: Template fallback on synthesis failure
- **WHEN** the synthesis LLM call fails
- **THEN** the emitted `text` equals the Phase 2 template text for that observation kind

### Requirement: AI unavailability degrades gracefully
When `AI_PROVIDER` is unset, the provider key is missing, or provider calls time out or error, the chat endpoint MUST still return a valid SSE stream (guiding or template `text` plus `done`), MUST NOT return HTTP 5xx for LLM-layer failures, and MUST NOT expose vendor errors or stack traces to the user.

#### Scenario: No key configured
- **WHEN** no provider API key is configured and a user sends a mood message
- **THEN** the reply is produced by the rule/template path and the stream shape matches the Phase 2 contract

### Requirement: Chat return intent emits a return SSE event
The LLM intent schema MUST support `intent: "return"` carrying a movie title resolved through the existing title-match service; the rule fallback uses the return-by-title branch above. A successful return MUST emit a `return` SSE event with `success` true, `rentalId`, `remainingStock`, and `code` `OK`; a failed return MUST emit `return` with `success` false and `code` `RENTAL_NOT_FOUND`. When the return intent cannot be resolved to a title (unresolved), the reply text MUST list the user's current `ACTIVE` rentals and MUST NOT emit `recommendation`, `borrow`, or `return` events.

#### Scenario: Return by chat message emits the event
- **WHEN** the user sends 「还千与千寻」 while holding an `ACTIVE` rental of it
- **THEN** the stream includes a `return` event with `success` true and the updated `remainingStock`

#### Scenario: Return homograph does not misfire
- **WHEN** the message contains 「还」 in its "still" sense with no title (for example 「还可以」)
- **THEN** no return tool runs: the rule fallback does not classify it as return, and the LLM path is not required for this outcome

#### Scenario: Unresolved return lists active rentals
- **WHEN** a return intent cannot be resolved to a unique title
- **THEN** the reply text names the user's current `ACTIVE` rentals (or states none are held) and no `return` event is emitted

### Requirement: Trip planning emits a trip SSE event

A successful trip plan MUST emit a `trip` SSE event in the same stream as the reply text, carrying `{ trip: TripResult }` where `TripResult` contains `tripId`, `destination`, `days`, the validated itinerary (day groups of steps with time, POI name, category, note, validated flag and optional location), and nullable route legs (from, to, distance, duration). An unresolved trip (no destination) MUST NOT emit a `trip` event; the reply text MUST ask for the destination. The `trip` event MUST be persisted in the session message payload with the other structured events and replayed identically when the session is reopened. Existing events (`text`, `recommendation`, `borrow`, `return`, `done`) MUST remain unchanged.

#### Scenario: Successful plan emits the event after text

- **WHEN** a trip plan succeeds
- **THEN** the stream contains a `text` event and a `trip` event with the full itinerary, followed by `done`, and the turn persisted under the session includes the `trip` event

#### Scenario: Replay restores the trip event

- **WHEN** a session whose payload contains a `trip` event is reopened
- **THEN** the replayed message payload contains the same `trip` event


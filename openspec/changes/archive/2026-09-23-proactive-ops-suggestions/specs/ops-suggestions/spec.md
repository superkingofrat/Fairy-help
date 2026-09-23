## Purpose

Lets store operators receive proactive, admin-only operational suggestions — threshold anomalies (low stock, high borrow ratio, dormancy) and a once-daily digest — generated from real aggregated store data and surfaced as a readable stream inside the admin insights dashboard, with deduplication, read state, and graceful LLM degradation.

## ADDED Requirements

### Requirement: Threshold anomalies proactively generate suggestions

The system MUST periodically evaluate store anomalies against the current insights aggregation and, upon detecting one, persist a suggestion carrying: a kind (`LOW_STOCK` for any movie with `stock <= 1`, `BORROW_RATIO` for borrowed-to-total stock ratio at or above 0.8, `DORMANT` when no borrow occurred in the last 7 days), a one-line summary, a body, and the triggering aggregate snapshot as source data. Evaluation MUST run without any external trigger or admin action. Suggestions MUST contain only store operational facts (movie titles, stock, counts, ratios) and MUST NOT contain any user identity, profile, or behavior-derived personal data.

#### Scenario: Low stock anomaly creates a suggestion

- **WHEN** an evaluation cycle runs while some movie has stock of 1 or 0
- **THEN** a `LOW_STOCK` suggestion is persisted whose source data includes that movie's title and stock, and it appears in the admin suggestion stream with the unread count incremented

#### Scenario: High borrow ratio creates a suggestion

- **WHEN** an evaluation cycle runs while active rentals / total stock is at or above 0.8
- **THEN** a `BORROW_RATIO` suggestion is persisted with the ratio in its source data

#### Scenario: Dormant store creates a suggestion

- **WHEN** an evaluation cycle runs and no borrow happened in the last 7 days
- **THEN** a `DORMANT` suggestion is persisted

#### Scenario: No anomaly, no suggestion

- **WHEN** an evaluation cycle runs while no threshold condition holds
- **THEN** no suggestion is generated

#### Scenario: Suggestions never carry user privacy

- **WHEN** any suggestion is generated
- **THEN** its summary, body, and source data contain no user email, no profile data, and no per-user behavior records

### Requirement: Suggestions are deduplicated while an anomaly is active

The system MUST NOT generate a second suggestion for an anomaly condition that already has an active (unresolved) suggestion of the same kind and subject. Once the underlying condition recovers and later recurs, the system MUST generate a new suggestion. The daily report MUST be deduplicated by local calendar day: at most one `DAILY_REPORT` suggestion per local day regardless of how many times generation is attempted (timer or manual). Deduplication MUST hold under concurrent attempts (concurrent generation attempts for the same key MUST NOT create duplicates).

#### Scenario: Persistent low stock reports once

- **WHEN** a movie's stock stays at 0 across multiple evaluation cycles
- **THEN** only one `LOW_STOCK` suggestion exists for that movie

#### Scenario: Recovered then re-broken stock reports again

- **WHEN** a low-stock suggestion exists, the movie's stock is replenished, and the stock later drops back to 0
- **THEN** a new `LOW_STOCK` suggestion is generated

#### Scenario: Manual daily generation is same-day idempotent

- **WHEN** an admin invokes the manual daily generation twice on the same local day
- **THEN** the first invocation creates the day's `DAILY_REPORT` and the second returns successfully without creating a duplicate

### Requirement: A daily digest is generated every local day at 08:00

The system MUST generate one `DAILY_REPORT` suggestion per local day at 08:00 server local time, summarizing the current insights aggregation (popular movies, borrow/return trend, inventory including low-stock list, mood/scene distribution, activity). The digest MUST be generated without any admin action, and a manual generation endpoint MUST produce the same artifact for the current local day.

#### Scenario: Morning digest appears without admin action

- **WHEN** the server local time passes 08:00 on a new local day with the API running
- **THEN** a `DAILY_REPORT` suggestion summarizing that day's overview exists in the stream

#### Scenario: Manual generation produces the same artifact

- **WHEN** an admin invokes the manual daily generation on a day with no digest yet
- **THEN** the response is 201 and the stream shows the day's `DAILY_REPORT` with the same shape as a timer-generated one

### Requirement: Suggestions are LLM-drafted from real data with template fallback

When an AI provider is available, the system MUST draft the suggestion body via the unified AI SDK `chat()` interface using a prompt that contains only the aggregate data and movie titles behind the suggestion — every number in the generated body MUST match the source data snapshot (no invented figures, no movie titles absent from the snapshot). When the AI provider is unavailable or fails (missing key, timeout, provider error), the system MUST fall back to a template-rendered data summary and still persist the suggestion. No path of suggestion generation MUST surface a 500 response or an uncaught error, and no path MUST expose raw provider error payloads in logs or responses.

#### Scenario: Provider available produces grounded prose

- **WHEN** a suggestion is generated while an AI provider is configured
- **THEN** its body is a natural-language operational suggestion in Fairy's voice and every figure and title in it comes from the source data snapshot

#### Scenario: Provider failure falls back to a template summary

- **WHEN** a suggestion is generated while the AI provider is unavailable or returns an error
- **THEN** the suggestion is still persisted with a template-rendered data summary body, no error reaches the admin, and no 500 occurs

#### Scenario: Provider errors are not echoed

- **WHEN** the AI provider returns an error during suggestion generation
- **THEN** logs record the failure without the provider's response payload and the API response contains no provider internals

### Requirement: The suggestion stream is admin-only with read state

The system MUST expose the suggestion stream, unread count, read marking, and manual daily generation to authenticated admins only, under the standard `{ code, data, msg }` envelope. Unauthenticated requests MUST receive 401; non-admin roles MUST receive 403. The list MUST be ordered by creation time descending with pagination. Marking a suggestion read MUST be idempotent (repeat calls return 200 and the read timestamp is unchanged). Unknown suggestion ids MUST receive 404 `SUGGESTION_NOT_FOUND`. All four suggestion kinds MUST count toward the unread count until marked read.

#### Scenario: Admin lists suggestions newest first

- **WHEN** an admin requests the suggestion list after several suggestions were created
- **THEN** the response is 200 with items newest-first under `{ code, data: { items, pagination }, msg }`

#### Scenario: Non-admin is denied

- **WHEN** a user-role account requests the suggestion list, the unread count, read marking, or manual generation
- **THEN** the response is 403 and no suggestion data is returned

#### Scenario: Read marking is idempotent

- **WHEN** an admin marks the same suggestion read twice
- **THEN** both calls return 200 and the stored read timestamp is unchanged

#### Scenario: Unknown id is a 404

- **WHEN** an admin marks an unknown suggestion id as read
- **THEN** the response is 404 `SUGGESTION_NOT_FOUND`

### Requirement: The admin insights dashboard surfaces the suggestion stream

The admin insights page MUST render the suggestion stream inline: newest first, unread suggestions visually highlighted, per-item and mark-all read actions, the current unread count, and a manual daily-generation action. The stream MUST handle loading, error, and empty states explicitly, and all labels MUST come from the web locale files. The existing overview dashboard behavior and `GET /api/insights/overview` contract MUST remain unchanged.

#### Scenario: Dashboard shows unread suggestions with counts

- **WHEN** an admin opens the insights page while unread suggestions exist
- **THEN** the stream lists them newest first with unread highlighting and the unread count badge matches the unread items

#### Scenario: Marking read updates the stream

- **WHEN** an admin marks one suggestion read (or all)
- **THEN** the item's unread highlight clears and the unread count decreases accordingly

#### Scenario: Empty and error states render

- **WHEN** the admin has no suggestions, or the suggestion request fails
- **THEN** the stream shows an empty state or an error state respectively, without breaking the rest of the dashboard

### Requirement: Generation runs unattended on a single deployed instance

The system MUST generate suggestions on a schedule (periodic threshold evaluation plus the 08:00 local daily digest) with no external cron or queue dependency, and MUST clean up its schedule on shutdown. In a multi-instance deployment the schedule MAY run more than once, but duplicates MUST be prevented by persistence-level deduplication — a missed trigger is acceptable, a duplicate suggestion is not. Because the daily digest and local-day bucketing depend on the server timezone, the documented deployment MUST pin the server timezone to `Asia/Shanghai`.

#### Scenario: Shutdown stops the schedule

- **WHEN** the API process shuts down
- **THEN** no further suggestion generation cycles run from that process

#### Scenario: Concurrent instances do not duplicate

- **WHEN** two API instances evaluate the same anomaly at the same time
- **THEN** at most one suggestion for that anomaly exists afterward

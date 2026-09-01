## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Trip planning emits a trip SSE event

A successful trip plan MUST emit a `trip` SSE event in the same stream as the reply text, carrying `{ trip: TripResult }` where `TripResult` contains `tripId`, `destination`, `days`, the validated itinerary (day groups of steps with time, POI name, category, note, validated flag and optional location), and nullable route legs (from, to, distance, duration). An unresolved trip (no destination) MUST NOT emit a `trip` event; the reply text MUST ask for the destination. The `trip` event MUST be persisted in the session message payload with the other structured events and replayed identically when the session is reopened. Existing events (`text`, `recommendation`, `borrow`, `return`, `done`) MUST remain unchanged.

#### Scenario: Successful plan emits the event after text

- **WHEN** a trip plan succeeds
- **THEN** the stream contains a `text` event and a `trip` event with the full itinerary, followed by `done`, and the turn persisted under the session includes the `trip` event

#### Scenario: Replay restores the trip event

- **WHEN** a session whose payload contains a `trip` event is reopened
- **THEN** the replayed message payload contains the same `trip` event

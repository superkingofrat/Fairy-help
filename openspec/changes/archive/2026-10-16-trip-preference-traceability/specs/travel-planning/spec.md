## ADDED Requirements

### Requirement: Preference attribution is conditional on itinerary evidence

The reply facts for a planned trip MUST only assert that a companion's preferences are reflected in the itinerary when the itinerary actually contains at least one non-null `preferenceBasis`. When the itinerary carries no such basis (no companion matched, the matched profile had no usable preferences, or the draft could not tie any POI to a preference), the facts MUST name the companion if one is present but MUST NOT claim that the companion's preferences are reflected. The facts MUST surface each non-null `preferenceBasis` verbatim so the reply can cite a concrete reason instead of repeating an assertion. In every case the reply MUST NOT invent preferences the companion never expressed (AGENTS §0).

#### Scenario: Reply cites a concrete basis when one exists

- **WHEN** a trip is planned with a companion and at least one step carries a non-null `preferenceBasis`
- **THEN** the facts block contains that basis text and asserts the companion's preferences are reflected, so the reply may attribute a specific arrangement to that companion (for example 「按莱卡恩的洁癖，避开了露天摊位」)

#### Scenario: No basis means no attribution claim

- **WHEN** a trip is planned with a companion but no step carries a `preferenceBasis`
- **THEN** the facts block names the companion without claiming the preferences are reflected, and the fallback template likewise carries no attribution claim

#### Scenario: Unrelated preferences are never invented

- **WHEN** the reply is generated for any planned trip
- **THEN** the reply attributes only arrangements that appear in the itinerary and only preferences that appear in the injected profile lines, never preferences the companion never expressed

## MODIFIED Requirements

### Requirement: Chat trip planning intent plans and persists an itinerary

The system MUST recognize a trip-planning request (for example 「帮我规划周末去杭州玩」) as the `plan_trip` intent and run the trip planning tool. The tool MUST read the user's profile travel style and the matched companion profile, draft an itinerary (destination, day count, per-day steps with time, POI name, category, note and preference basis) via the LLM, validate each POI against the Amap server-side search API using the destination city, compute route legs between consecutive POIs, and on success persist a `Trip` row owned by the requesting user with the validated itinerary and route, write a `TRIP_PLANNED` behavior log, and return the itinerary.

When a companion profile was matched, the draft prompt MUST additionally require that every non-empty preference of that companion be reflected in at least one POI choice and be named in that step's `preferenceBasis`. Each step's `preferenceBasis` MUST be a short statement of which preference drove the choice or avoidance (for example 「洁癖 → 避开露天摊位」), MUST be `null` when no preference can be tied to that step, and MUST NOT be filled merely to have a value. The `note` field MUST remain limited to execution information (time, reservation, queueing) and MUST NOT carry preference rationale. When a companion profile was matched, the persisted `Trip` row MUST also record that companion's name and user id in the same transaction, and the returned trip result MUST carry a `companion` object `{ name, userId }`. When no companion was matched, `companion` MUST be `null`, the two columns MUST be empty, the `TRIP_PLANNED` payload MUST NOT gain any new key, and the user message sent to the draft model MUST be byte-for-byte identical to the message before preference injection existed. A successful plan MUST emit a `trip` SSE event carrying the full trip result including `companion` and per-step `preferenceBasis`. A `chitchat` classification MUST NOT run the trip tool or create any `Trip` row.

#### Scenario: User asks to plan a weekend trip

- **WHEN** a user sends 「帮我规划周末去杭州玩」
- **THEN** the stream includes a `trip` event whose trip has destination 杭州, at least one itinerary day with POI steps, and a `done` event, and a `Trip` row owned by that user exists with the same itinerary

#### Scenario: Profile travel style shapes the draft

- **WHEN** the user's profile has a `travelStyle` and the user asks for a trip plan
- **THEN** the itinerary draft prompt includes the travel style and the generated itinerary reflects it

#### Scenario: Chitchat never plans a trip

- **WHEN** a user sends a pure greeting or unrelated small talk
- **THEN** no trip tool runs and no `Trip` row is created

#### Scenario: Matched companion is persisted with the trip

- **WHEN** a user's message names a registered companion profile and a trip is planned
- **THEN** the returned trip result and the emitted `trip` event carry `companion: { name, userId }`, and the `Trip` row records the same two values

#### Scenario: No companion means null, not an empty shell

- **WHEN** a trip is planned without any companion name in the message
- **THEN** `companion` is `null` in the result and the event, the `Trip` columns are empty, the `TRIP_PLANNED` log payload is unchanged, and every step's `preferenceBasis` is `null`

#### Scenario: A tied preference is recorded as a basis

- **WHEN** a trip is planned with a companion whose profile states a preference that the draft could act on
- **THEN** at least one step carries a non-null `preferenceBasis` naming that preference and the resulting choice or avoidance, and the chosen POI itself reflects it

#### Scenario: No tieable preference yields null, not filler

- **WHEN** a step cannot be tied to any injected preference
- **THEN** that step's `preferenceBasis` is `null` and no invented rationale is written

### Requirement: Trips can be created through a REST endpoint

The system MUST expose `POST /api/trips` to authenticated users holding the `admin` or `agent` role, accepting a JSON body `{ destination, days? }` (destination 1–100 characters; days optional integer 1–14) and responding `{ code, data, msg }` with the created trip result. Creation MUST run the same planning pipeline as chat planning — profile travel style and companion profile in the LLM draft, the preference-basis requirement, Amap server-side POI/route validation with the same graceful degradation, transactional `Trip` persistence, `TRIP_PLANNED` behavior log — and MUST NOT introduce a second itinerary-generation implementation. The created trip result MUST carry the same `companion` object (or `null`) and the same per-step `preferenceBasis` values as the chat path. Requests from any other role MUST be rejected with 403 `TRIP_FORBIDDEN` WITHOUT invoking the LLM, persisting a `Trip`, or writing any behavior log. Unauthenticated requests MUST be rejected with 401. Invalid bodies MUST be rejected with 400 `VALIDATION_ERROR`.

#### Scenario: Agent creates a trip without chatting

- **WHEN** an authenticated `agent` posts `{ "destination": "杭州", "days": 2 }` to `POST /api/trips`
- **THEN** the response is 201 with `{ code: "OK", data: <trip result>, msg }`, a `Trip` row owned by that user exists, and a `TRIP_PLANNED` log is written

#### Scenario: Regular users cannot create trips over REST

- **WHEN** an authenticated user with the `user` role posts to `POST /api/trips`
- **THEN** the response is 403 `TRIP_FORBIDDEN`, no LLM call is made, no `Trip` row is created, and no behavior log is written

#### Scenario: Missing destination is a validation error

- **WHEN** a request body omits `destination` or exceeds its length limits
- **THEN** the response is 400 `VALIDATION_ERROR` and no `Trip` row is created

#### Scenario: REST creation carries the basis too

- **WHEN** the composed planning message names a registered companion profile and `POST /api/trips` succeeds
- **THEN** the 201 response data carries the same `companion` object and the same per-step `preferenceBasis` values as the equivalent chat request

### Requirement: Trip timeline renders the itinerary

The web chat MUST render a trip timeline card from a `trip` event (live) and from replayed session payloads, showing the destination, the day count, each itinerary day grouped with its steps (time, POI name, category, note), a validated badge per POI (distinguishing validated from unvalidated), and a route summary (total distance and duration) when route legs exist. When the trip carries a `companion`, the card MUST also show that companion's name (for example 「与莱卡恩同行」); when `companion` is `null` or absent, no companion line MUST render. When a step carries a non-null `preferenceBasis`, the card MUST also show that basis text; when it is `null` or absent, no basis text MUST render and no placeholder MUST appear. The same card MUST render on the `/trips` history page for a stored trip detail, and MUST include the map overlay defined in the map requirement. All labels MUST come from the web locale files.

#### Scenario: Live trip event renders a card

- **WHEN** the chat stream delivers a `trip` event
- **THEN** the message renders a trip card with the destination, day groups and steps from the event

#### Scenario: Replayed history renders the same card

- **WHEN** a session with a stored `trip` event is reopened
- **THEN** the trip card renders from the replayed payload with the same content, and a stored payload without the `companion` or `preferenceBasis` keys still renders without error

#### Scenario: History page renders a stored trip

- **WHEN** an authenticated user opens a trip they previously created from the `/trips` page
- **THEN** the same trip card (itinerary, badges, route summary, map overlay per the map requirement) renders from the stored trip detail

#### Scenario: Unvalidated POIs are marked

- **WHEN** a trip was planned without Amap validation
- **THEN** each POI shows an unvalidated badge (for example 「待确认」) instead of validated

#### Scenario: Companion name appears on the card

- **WHEN** a trip carrying `companion` is displayed, live or replayed
- **THEN** the card shows the companion's name alongside the destination and day count, using a locale label

#### Scenario: No companion renders no companion line

- **WHEN** a trip with `companion: null` is displayed
- **THEN** no companion line renders and no placeholder text appears

#### Scenario: Preference basis appears on the step that earned it

- **WHEN** a trip step carrying a non-null `preferenceBasis` is displayed, live or replayed
- **THEN** the card shows that basis text for that step, using a locale label

#### Scenario: No basis renders no basis text

- **WHEN** a trip step with `preferenceBasis: null` is displayed
- **THEN** no basis text renders and no placeholder appears

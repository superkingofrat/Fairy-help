## ADDED Requirements

### Requirement: The reply attributes preference-driven arrangements to the companion

When a trip result carries a `companion`, the facts handed to the reply model MUST name that companion and state that the companion's preferences are already reflected in the itinerary, so the reply MAY attribute specific arrangements to that companion. The reply MUST NOT invent preferences the companion never expressed. When no companion is present, the facts and the fallback template MUST be byte-for-byte identical to the no-companion behavior.

#### Scenario: Reply can credit the companion's preferences

- **WHEN** a trip is planned with a companion and the reply is generated
- **THEN** the reply may attribute arrangements to that companion (for example 「按莱卡恩的习惯订了包间」) and the facts block names the companion

#### Scenario: No companion leaves the reply untouched

- **WHEN** a trip is planned without a companion
- **THEN** the facts block and the fallback template are identical to the behavior before companion attribution existed

## MODIFIED Requirements

### Requirement: Chat trip planning intent plans and persists an itinerary

The system MUST recognize a trip-planning request (for example 「帮我规划周末去杭州玩」) as the `plan_trip` intent and run the trip planning tool. The tool MUST read the user's profile travel style and the matched companion profile, draft an itinerary (destination, day count, per-day steps with time, POI name, category and note) via the LLM, validate each POI against the Amap server-side search API using the destination city, compute route legs between consecutive POIs, and on success persist a `Trip` row owned by the requesting user with the validated itinerary and route, write a `TRIP_PLANNED` behavior log, and return the itinerary. When a companion profile was matched, the persisted `Trip` row MUST also record that companion's name and user id in the same transaction, and the returned trip result MUST carry a `companion` object `{ name, userId }`. When no companion was matched, `companion` MUST be `null`, the two columns MUST be empty, and the `TRIP_PLANNED` payload MUST NOT gain any new key. A successful plan MUST emit a `trip` SSE event carrying the full trip result including `companion`. A `chitchat` classification MUST NOT run the trip tool or create any `Trip` row.

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

- **WHEN** the user's message names a registered companion profile and a trip is planned
- **THEN** the returned trip result and the emitted `trip` event carry `companion: { name, userId }`, and the `Trip` row records the same two values

#### Scenario: No companion means null, not an empty shell

- **WHEN** a trip is planned without any companion name in the message
- **THEN** `companion` is `null` in the result and the event, the `Trip` columns are empty, and the `TRIP_PLANNED` log payload is unchanged

### Requirement: Trips can be created through a REST endpoint

The system MUST expose `POST /api/trips` to authenticated users holding the `admin` or `agent` role, accepting a JSON body `{ destination, days? }` (destination 1–100 characters; days optional integer 1–14) and responding `{ code, data, msg }` with the created trip result. Creation MUST run the same planning pipeline as chat planning — profile travel style and companion profile in the LLM draft, Amap server-side POI/route validation with the same graceful degradation, transactional `Trip` persistence, `TRIP_PLANNED` behavior log — and MUST NOT introduce a second itinerary-generation implementation. The created trip result MUST carry the same `companion` object (or `null`) as the chat path. Requests from any other role MUST be rejected with 403 `TRIP_FORBIDDEN` WITHOUT invoking the LLM, persisting a `Trip`, or writing any behavior log. Unauthenticated requests MUST be rejected with 401. Invalid bodies MUST be rejected with 400 `VALIDATION_ERROR`.

#### Scenario: Agent creates a trip without chatting

- **WHEN** an authenticated `agent` posts `{ "destination": "杭州", "days": 2 }` to `POST /api/trips`
- **THEN** the response is 201 with `{ code: "OK", data: <trip result>, msg }`, a `Trip` row owned by that user exists, and a `TRIP_PLANNED` log is written

#### Scenario: Regular users cannot create trips over REST

- **WHEN** an authenticated user with the `user` role posts to `POST /api/trips`
- **THEN** the response is 403 `TRIP_FORBIDDEN`, no LLM call is made, no `Trip` row is created, and no behavior log is written

#### Scenario: Missing destination is a validation error

- **WHEN** a request body omits `destination` or exceeds its length limits
- **THEN** the response is 400 `VALIDATION_ERROR` and no `Trip` row is created

#### Scenario: REST creation carries the companion too

- **WHEN** the composed planning message names a registered companion profile and `POST /api/trips` succeeds
- **THEN** the 201 response data carries the same `companion` object as the equivalent chat request

### Requirement: Trip history is readable only by its owner or an admin

The system MUST expose `GET /api/trips` returning the caller's trips in `createdAt` descending order with pagination (`{ items, pagination }` under the standard envelope), and `GET /api/trips/:id` returning one trip's full result. A trip detail MUST project the companion snapshot: when both stored columns are present, `companion` is `{ name, userId }`; when either is missing (including trips created before the companion columns existed), `companion` MUST be `null` and no partial object MUST be produced. An authenticated `admin` MAY list another user's trips via an explicit `userId` query parameter on the list endpoint. A trip detail request for a trip owned by another non-admin caller MUST respond 404 `TRIP_NOT_FOUND` (not leaking existence); the same response MUST be used for unknown ids. All list/detail endpoints MUST reject unauthenticated requests with 401. Trip payloads MUST NOT contain the owner's email or any other user's data.

#### Scenario: Owner sees their own trips newest first

- **WHEN** an authenticated user requests `GET /api/trips` after having planned two trips
- **THEN** the response contains only that user's trips, ordered by `createdAt` descending, with pagination metadata

#### Scenario: Another user's trip id is invisible

- **WHEN** an authenticated non-admin user requests `GET /api/trips/:id` with an id owned by someone else
- **THEN** the response is 404 `TRIP_NOT_FOUND`, identical to an unknown id

#### Scenario: Admin can inspect a specific user's trips

- **WHEN** an authenticated admin requests `GET /api/trips?userId=<other-user-id>`
- **THEN** the response lists that user's trips instead of the admin's own

#### Scenario: Stored trip detail replays the companion

- **WHEN** an authenticated owner requests the detail of a trip that was planned with a companion
- **THEN** the response `data.companion` equals `{ name, userId }` as persisted

#### Scenario: A trip without companion columns replays as null

- **WHEN** a trip detail is requested for a trip whose companion columns are empty
- **THEN** `data.companion` is `null` and the rest of the trip result is unchanged

### Requirement: Trip timeline renders the itinerary

The web chat MUST render a trip timeline card from a `trip` event (live) and from replayed session payloads, showing the destination, the day count, each itinerary day grouped with its steps (time, POI name, category, note), a validated badge per POI (distinguishing validated from unvalidated), and a route summary (total distance and duration) when route legs exist. When the trip carries a `companion`, the card MUST also show that companion's name (for example 「与莱卡恩同行」); when `companion` is `null` or absent, no companion line MUST render. The same card MUST render on the `/trips` history page for a stored trip detail, and MUST include the map overlay defined in the map requirement. All labels MUST come from the web locale files.

#### Scenario: Live trip event renders a card

- **WHEN** the chat stream delivers a `trip` event
- **THEN** the message renders a trip card with the destination, day groups and steps from the event

#### Scenario: Replayed history renders the same card

- **WHEN** a session with a stored `trip` event is reopened
- **THEN** the trip card renders from the replayed payload with the same content, and a stored payload without the `companion` key still renders without error

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

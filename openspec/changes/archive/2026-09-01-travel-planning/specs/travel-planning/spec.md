## Purpose

Provides conversational travel planning: when a user asks the chat agent to plan a trip, the system recognizes the `plan_trip` intent, drafts an itinerary from the user's message and profile travel style, validates each point of interest (POI) and computes route legs through the Amap server-side API, persists the trip per user, and emits a `trip` SSE event that the web chat renders as a timeline card. When Amap is unavailable or the destination is missing, the system degrades gracefully instead of failing.

## ADDED Requirements

### Requirement: Chat trip planning intent plans and persists an itinerary

The system MUST recognize a trip-planning request (for example 「帮我规划周末去杭州玩」) as the `plan_trip` intent and run the trip planning tool. The tool MUST read the user's profile travel style, draft an itinerary (destination, day count, per-day steps with time, POI name, category and note) via the LLM, validate each POI against the Amap server-side search API using the destination city, compute route legs between consecutive POIs, and on success persist a `Trip` row owned by the requesting user with the validated itinerary and route, write a `TRIP_PLANNED` behavior log, and return the itinerary. A successful plan MUST emit a `trip` SSE event carrying the full trip result. A `chitchat` classification MUST NOT run the trip tool or create any `Trip` row.

#### Scenario: User asks to plan a weekend trip

- **WHEN** a user sends 「帮我规划周末去杭州玩」
- **THEN** the stream includes a `trip` event whose trip has destination 杭州, at least one itinerary day with POI steps, and a `done` event, and a `Trip` row owned by that user exists with the same itinerary

#### Scenario: Profile travel style shapes the draft

- **WHEN** the user's profile has a `travelStyle` and the user asks for a trip plan
- **THEN** the itinerary draft prompt includes the travel style and the generated itinerary reflects it

#### Scenario: Chitchat never plans a trip

- **WHEN** the user sends a pure greeting or unrelated small talk
- **THEN** no trip tool runs and no `Trip` row is created

### Requirement: Amap validation degrades gracefully

The trip tool MUST treat the Amap server-side API as optional: when `AMAP_SERVER_KEY` is missing, the Amap call times out, or Amap returns an error, the tool MUST still return the LLM-drafted itinerary with every POI marked `validated: false` and no route legs, MUST NOT crash the request, and MUST NOT expose the API key, response payloads, or stack traces to the user. When Amap succeeds, POI entries MUST carry the validated location and be marked `validated: true`, and route legs MUST carry distance and duration where available. In unit tests the Amap client MUST be mocked; real Amap calls MUST NOT be made in CI.

#### Scenario: Missing key still returns an itinerary

- **WHEN** `AMAP_SERVER_KEY` is not configured and a user asks for a trip plan
- **THEN** the request succeeds with a `trip` event whose POIs are marked `validated: false` and whose route is null, with no server error

#### Scenario: Amap error is not exposed

- **WHEN** the Amap search API errors while validating POIs
- **THEN** the itinerary is still returned unvalidated and the reply and events contain no key, raw response, or stack trace

### Requirement: Missing destination asks for clarification

When the trip tool cannot determine a destination from the user's message (for example 「帮我规划个行程」 with no place name), the tool MUST NOT persist a `Trip` row and MUST NOT emit a `trip` event; the reply MUST instead ask the user where they want to go.

#### Scenario: No destination in the message

- **WHEN** the user asks to plan a trip without naming a destination
- **THEN** the reply asks for the destination (for example 「想去哪儿玩呀？告诉我一个城市，我来帮你规划」) and no `Trip` row is created

### Requirement: Trip timeline renders the itinerary

The web chat MUST render a trip timeline card from a `trip` event (live) and from replayed session payloads, showing the destination, the day count, each itinerary day grouped with its steps (time, POI name, category, note), a validated badge per POI (distinguishing validated from unvalidated), and a route summary (total distance and duration) when route legs exist. All labels MUST come from the web locale files.

#### Scenario: Live trip event renders a card

- **WHEN** the chat stream delivers a `trip` event
- **THEN** the message renders a trip card with the destination, day groups and steps from the event

#### Scenario: Replayed history renders the same card

- **WHEN** a session with a stored `trip` event is reopened
- **THEN** the trip card renders from the replayed payload with the same content

#### Scenario: Unvalidated POIs are marked

- **WHEN** a trip was planned without Amap validation
- **THEN** each POI shows an unvalidated badge (for example 「待确认」) instead of validated

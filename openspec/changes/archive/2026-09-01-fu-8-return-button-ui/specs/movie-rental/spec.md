## ADDED Requirements

### Requirement: Rental list is queryable by owner or admin
The system MUST expose `GET /api/rentals` for Bearer-authenticated callers. A caller MUST receive their own rentals ordered by `createdAt` descending; `?status=ACTIVE` MUST filter to active rentals only. An admin MUST be able to query another user's rentals via `?userId=<uuid>`; without it the admin sees their own. Each row MUST include `rentalId`, `movieId`, `movieTitle` (resolved from catalog), `status`, `borrowedAt`, and `returnedAt` when the rental was returned. A missing `userId` target MUST return 404 `USER_NOT_FOUND`; a non-UUID `userId` MUST return 400 `INVALID_USER_ID`; a non-admin querying another user MUST return 403 `FORBIDDEN`; a missing token MUST return 401. A valid user with no rentals MUST receive 200 with an empty array. Pagination is not required.

#### Scenario: Owner reads own rental history
- **WHEN** a `user` role caller requests `GET /api/rentals`
- **THEN** the response is 200 with their own rentals ordered newest first, each row carrying the resolved `movieTitle` and `status`

#### Scenario: Status filter narrows to active
- **WHEN** the same caller requests `GET /api/rentals?status=ACTIVE`
- **THEN** only rentals with `status` ACTIVE are returned

#### Scenario: Admin queries another user
- **WHEN** an admin requests `GET /api/rentals?userId=<a-different-user-id>`
- **THEN** the response is 200 with that user's rentals; a nonexistent target returns 404 `USER_NOT_FOUND` and a malformed one returns 400 `INVALID_USER_ID`

#### Scenario: User cannot read another user's rentals
- **WHEN** a `user` role caller requests `GET /api/rentals?userId=<someone-else>`
- **THEN** the response is 403 `FORBIDDEN`

### Requirement: One-click return uses the chat deterministic path
The chat request schema MUST accept `action` with value `return`; when present, `movieId` MUST also be present or the request MUST fail with 400 `VALIDATION_ERROR`. A request `{ movieId, action: "return" }` MUST execute the return without LLM intent classification and MUST ignore any `message`. A successful return MUST emit the `return` SSE event and a confirmation `text`; a failed return (e.g. no active rental) MUST NOT return 500 — it MUST emit an apologetic `text` explaining the state and the client MUST refresh rental state afterward.

#### Scenario: Button return succeeds without intent classification
- **WHEN** a caller posts `{ message: "", movieId: <actively-rented-id>, action: "return" }`
- **THEN** the rental becomes RETURNED, stock increments, a `return` SSE event reports success, and a confirmation text is emitted — even when the message text would not match any return intent

#### Scenario: Action without movieId is rejected
- **WHEN** a caller posts `{ message: "", action: "return" }` with no `movieId`
- **THEN** the response is 400 `VALIDATION_ERROR` and no rental changes

#### Scenario: Failed return degrades to apologetic text
- **WHEN** the caller has no ACTIVE rental for the given movie
- **THEN** the stream emits an apologetic `text` with no 500, and no rental or stock row changes

### Requirement: Chat page surfaces active rentals with one-click return
The chat page MUST show a persistent rentals strip listing the caller's active rentals, each with a return control; the strip MUST be hidden entirely when there are none. A recommendation card for a movie the caller has actively borrowed MUST show a return control instead of the borrow control, and the return control MUST remain usable when the movie is out of stock. After a successful return the strip entry MUST disappear and the card MUST revert to showing the borrow control. The client MUST refresh the rental state on mount and after each chat turn completes.

#### Scenario: Strip lists active rentals and hides when empty
- **WHEN** the caller has active rentals, the chat page strip lists each title with a return control
- **THEN** when the last active rental is returned, the strip disappears entirely

#### Scenario: Card toggles between borrow and return
- **WHEN** a recommended movie is in the caller's active rentals
- **THEN** its card shows a return control (clickable even at zero stock); after returning, the card shows the borrow control again

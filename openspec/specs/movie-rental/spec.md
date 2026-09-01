# movie-rental Specification

## Purpose

Creates an active rental and decrements catalog stock in one atomic operation, or fails with a stable error code without changing stock when the copy cannot be lent.

## Requirements

### Requirement: Structured movieId borrow mutates stock once
When `movieId` is a valid UUID of an existing in-stock movie and the user has no active rental of that movie, the system SHALL decrement `stock` by 1, insert an `ACTIVE` rental for that user and movie, and emit a `borrow` SSE event with `success` true, `rentalId`, `remainingStock`, and `code` `OK`.

#### Scenario: First successful borrow
- **WHEN** `dev-user` posts `movieId` for a movie with `stock` 3 and no active rental of it
- **THEN** that movie's `stock` becomes 2, one `ACTIVE` rental exists, and the stream includes `borrow` with `success` true and `remainingStock` 2

### Requirement: Conflicts do not reduce stock
If the movie is missing, the system SHALL fail with `code` `MOVIE_NOT_FOUND`. If `stock` is 0, it SHALL fail with `OUT_OF_STOCK` and MUST NOT insert an active rental. If an `ACTIVE` rental already exists for the same user and movie, it SHALL fail with `ALREADY_BORROWED` and MUST NOT change `stock`. Concurrent borrows MUST NOT drive `stock` below 0 (conditional decrement). Out-of-stock failures MUST append a behavior-log failure record; already-borrowed MUST NOT increment stock.

#### Scenario: Duplicate active rental
- **WHEN** the same user borrows the same movie id a second time while the first rental is still `ACTIVE`
- **THEN** `stock` is unchanged, no second active rental is created, and `borrow` has `success` false and `code` `ALREADY_BORROWED`

#### Scenario: Zero stock
- **WHEN** the user borrows a movie whose `stock` is 0
- **THEN** no new active rental is created and `borrow` has `code` `OUT_OF_STOCK`

### Requirement: Title-only borrow resolves uniquely or does nothing
When there is no `movieId` but the message is a title borrow, the system SHALL match catalog titles with case-insensitive containment after trim. Zero or more than one match MUST result in apologetic `text` only, MUST NOT change stock, and MUST NOT emit a successful `borrow`.

#### Scenario: Ambiguous title
- **WHEN** the message asks to borrow a fragment that matches two titles
- **THEN** stock is unchanged and no `borrow` success event is emitted

### Requirement: Return closes the active rental and restocks once
When the user has an `ACTIVE` rental of the given movie, the system SHALL atomically set that rental to `RETURNED`, increment the movie's `stock` by 1, and report the new `remainingStock`. If no `ACTIVE` rental exists for that user and movie, the system SHALL fail with `code` `RENTAL_NOT_FOUND` and MUST NOT change `stock` or any rental. A repeated return of the same rental MUST fail with `RENTAL_NOT_FOUND` (idempotent safety). A successful return MUST append a behavior-log `RETURN_SUCCESS` row; failures MUST NOT append one.

#### Scenario: Successful return restocks
- **WHEN** `dev-user` returns a movie with an `ACTIVE` rental and the movie's `stock` is 2
- **THEN** the rental becomes `RETURNED`, the movie's `stock` becomes 3, and the result reports `remainingStock` 3

#### Scenario: Returning without an active rental
- **WHEN** the user has no `ACTIVE` rental of the given movie
- **THEN** the call fails with `code` `RENTAL_NOT_FOUND` and neither `stock` nor any rental row changes

#### Scenario: Repeat return is rejected
- **WHEN** the same rental is returned a second time
- **THEN** the call fails with `RENTAL_NOT_FOUND` and `stock` is not incremented again

### Requirement: REST borrow endpoint shares the rental transaction
The system MUST expose `POST /api/borrow` for Bearer-authenticated callers with body `{ movieId: uuid }`. The borrower MUST be the token subject; a `userId` in the request body MUST be ignored. Success MUST return 201 with `{ rentalId, remainingStock }`; `MOVIE_NOT_FOUND` MUST map to 404, `ALREADY_BORROWED` and `OUT_OF_STOCK` MUST map to 409, an invalid body MUST return 400 `VALIDATION_ERROR`, and a missing token MUST return 401. The endpoint MUST reuse the same borrow transaction and behavior-log combination as the chat tool path — no second borrow implementation.

#### Scenario: Successful REST borrow
- **WHEN** a logged-in user posts a valid `movieId` of an in-stock movie they have not borrowed
- **THEN** the response is 201 with `rentalId` and `remainingStock`, the stock is decremented, an `ACTIVE` rental is created for the token subject, and a `BORROW_SUCCESS` behavior log is written

#### Scenario: Conflicts map to HTTP statuses
- **WHEN** the movie is missing, already actively borrowed by the caller, or out of stock
- **THEN** the responses are 404 `MOVIE_NOT_FOUND`, 409 `ALREADY_BORROWED`, and 409 `OUT_OF_STOCK` respectively, with stock unchanged in the conflict cases

#### Scenario: Body userId is ignored
- **WHEN** the request body carries a `userId` different from the token subject
- **THEN** the rental is created for the token subject and the body value has no effect

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
### Requirement: Library page lists catalog with filters and direct borrow
The system MUST expose a `/movies` page to Bearer-authenticated callers (user and admin) that lists the catalog with pagination, filterable by `mood` and/or `scene` tags and a `keyword`, and MUST provide a per-title borrow control that calls the REST borrow endpoint. The page MUST reuse the catalog list and search endpoints; a filtered request MUST reach the search endpoint with the composed `mood`/`scene`/`keyword`/`page`/`limit` parameters. A borrow via this control MUST behave exactly like the REST borrow endpoint: success marks the title borrowed and decrements stock once; a conflict (`ALREADY_BORROWED`, `OUT_OF_STOCK`) MUST be surfaced as an in-page friendly message and MUST NOT cause a 500.

#### Scenario: Page renders paginated catalog
- **WHEN** a logged-in user opens `/movies`
- **THEN** the page lists catalog titles with pagination and each title has a borrow control

#### Scenario: Filters compose into a search request
- **WHEN** the user selects mood `治愈`, scene `雨天`, and a keyword `星际`
- **THEN** the page requests the search endpoint with `mood=治愈&scene=雨天&keyword=星际` and the pagination parameters, and renders the results

#### Scenario: Direct borrow succeeds through the REST path
- **WHEN** the user clicks borrow on an in-stock title they have not borrowed
- **THEN** the REST borrow endpoint returns 201, the title is marked borrowed on the page, the stock is decremented, and an `ACTIVE` rental and `BORROW_SUCCESS` log are created

#### Scenario: Borrow conflict stays in-page
- **WHEN** the clicked title is already actively borrowed or out of stock
- **THEN** the page shows a friendly message next to the title and the request does not produce a 500

### Requirement: Library page marks actively borrowed titles
The library page MUST mark titles the caller has actively borrowed, sourced from the rentals query filtered to `ACTIVE`, and MUST disable their borrow control showing a borrowed label. The borrowed set MUST be refreshed on page mount so that returning a title on the chat page makes it borrowable again on the library page. The page MUST NOT offer a return control — returning remains exclusive to the chat path.

#### Scenario: Actively borrowed title is marked and disabled
- **WHEN** the caller has an `ACTIVE` rental for a catalog title
- **THEN** that title shows a borrowed label and its borrow control is disabled

#### Scenario: Return elsewhere restores borrowability
- **WHEN** the caller returns the title on the chat page and reopens `/movies`
- **THEN** the title's borrow control is enabled again on the next page load

#### Scenario: No return control on the library page
- **WHEN** the caller views a borrowed title on the library page
- **THEN** no return control is offered there; returning happens only through the chat page

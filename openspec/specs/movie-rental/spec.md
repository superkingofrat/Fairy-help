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

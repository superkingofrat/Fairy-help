## Purpose

Creates an active rental and decrements catalog stock in one atomic operation, or fails with a stable error code without changing stock when the copy cannot be lent.

## ADDED Requirements

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

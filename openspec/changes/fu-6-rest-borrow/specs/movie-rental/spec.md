## ADDED Requirements

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

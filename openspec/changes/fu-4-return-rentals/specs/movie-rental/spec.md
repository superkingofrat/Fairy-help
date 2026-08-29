## ADDED Requirements

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

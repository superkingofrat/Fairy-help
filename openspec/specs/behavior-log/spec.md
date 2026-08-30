# behavior-log Specification

## Purpose

Appends an audit row for recommend success and for borrow success or out-of-stock failure and exposes the history as an admin-only read-only feed (append-only: no update or delete surface).

## Requirements

### Requirement: Successful recommend and borrow persist a log row
The system SHALL append a behavior-log row for a successful recommendation (with user id and related movie ids), for a successful borrow (with user id, movie id, and rental id), and for a successful return (with user id, movie id, and rental id). Out-of-stock borrow MUST append a failure row. Unmatched chat MUST NOT append a row. Return failures MUST NOT append a row.

#### Scenario: Recommend writes a log
- **WHEN** a recommend request returns at least one card
- **THEN** a behavior-log row exists for that user with recommend action and associated movie ids

#### Scenario: Unmatched writes nothing
- **WHEN** the message is unmatched
- **THEN** no new behavior-log row is created for that request

#### Scenario: Return writes a log
- **WHEN** a return succeeds
- **THEN** a behavior-log row exists for that user with return action, the movie id, and the rental id

### Requirement: Admin queries the behavior log feed
The system MUST expose `GET /api/behavior-logs` for admins only, returning a `createdAt`-descending, paginated feed (`page`, `limit` default 1/20, max 100) with optional `action` enum filter and optional `userId` UUID filter. Each item MUST include the log fields plus the user's email, the resolved `movieTitle` for a single-`movieId` row, and `recommendCount` (length of the RECOMMEND payload's movie ids) instead of the raw payload. Non-admin callers MUST receive 403 `FORBIDDEN`; an invalid `userId` MUST return 400 `INVALID_USER_ID`; an unknown `action` MUST return 400 `VALIDATION_ERROR`. The system MUST NOT provide any endpoint that updates or deletes behavior-log rows.

#### Scenario: Admin lists a resolved feed
- **WHEN** an admin requests the feed after a recommend and a borrow have been logged
- **THEN** rows are ordered newest-first and include the user's email, the movie title for the borrow row, and a recommend count for the recommend row, with no raw payload in the response

#### Scenario: User role cannot list
- **WHEN** a `user` role requests the feed
- **THEN** the response is 403 with code `FORBIDDEN`

#### Scenario: Filter validation
- **WHEN** the feed is requested with an unknown action or a non-UUID userId
- **THEN** the response is 400 with `VALIDATION_ERROR` or `INVALID_USER_ID` respectively

#### Scenario: Append-only is preserved
- **WHEN** any client sends DELETE, PUT, or PATCH to a behavior-log path
- **THEN** no such route exists and no log row is modified or removed

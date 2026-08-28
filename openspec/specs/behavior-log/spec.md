# behavior-log Specification

## Purpose

Appends an audit row for recommend success and for borrow success or out-of-stock failure so later memory features can read history without a query UI in this change.

## Requirements

### Requirement: Successful recommend and borrow persist a log row
The system SHALL append a behavior-log row for a successful recommendation (with user id and related movie ids) and for a successful borrow (with user id, movie id, and rental id). Out-of-stock borrow MUST append a failure row. Unmatched chat MUST NOT append a row.

#### Scenario: Recommend writes a log
- **WHEN** a recommend request returns at least one card
- **THEN** a behavior-log row exists for that user with recommend action and associated movie ids

#### Scenario: Unmatched writes nothing
- **WHEN** the message is unmatched
- **THEN** no new behavior-log row is created for that request

### Requirement: No log query surface in this change
The system MUST NOT add an HTTP API or admin page that lists behavior logs.

#### Scenario: No list endpoint
- **WHEN** a client calls a dedicated behavior-log list path if one were documented
- **THEN** this change does not provide such a working endpoint

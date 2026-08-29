## MODIFIED Requirements

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

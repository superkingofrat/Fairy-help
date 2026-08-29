## MODIFIED Requirements

### Requirement: Intent priority is movieId then title-borrow then tags then unmatched
The rule classifier — used as the fallback path when the LLM path is unavailable or fails — SHALL classify each request in this order: (1) valid `movieId` is borrow (no LLM call); (2) else if the message is a borrow-by-title request, resolve titles; (3) else if the message contains 「还」 AND exactly one catalog title matches, it is a return-by-title request; (4) else if the message contains at least one mood or scene enum label as a substring, it is recommend; (5) else unmatched. Unmatched MUST emit only guiding `text` and `done`, MUST NOT emit `recommendation` or `borrow`, and MUST NOT create rental or behavior-log rows.

#### Scenario: Unrecognized small talk
- **WHEN** the LLM path is unavailable and the user sends a message with no mood/scene label and no borrow intent (for example asking the weekday)
- **THEN** the stream contains guiding `text` mentioning mood/scene or card borrow, contains no `recommendation` event, and no new rental or behavior log is stored

#### Scenario: Return title under rule fallback
- **WHEN** the LLM path is unavailable and the message contains 「还」 with exactly one catalog title match (for example 「还千与千寻」)
- **THEN** the dispatch runs the return tool for that movie

## ADDED Requirements

### Requirement: Chat return intent emits a return SSE event
The LLM intent schema MUST support `intent: "return"` carrying a movie title resolved through the existing title-match service; the rule fallback uses the return-by-title branch above. A successful return MUST emit a `return` SSE event with `success` true, `rentalId`, `remainingStock`, and `code` `OK`; a failed return MUST emit `return` with `success` false and `code` `RENTAL_NOT_FOUND`. When the return intent cannot be resolved to a title (unresolved), the reply text MUST list the user's current `ACTIVE` rentals and MUST NOT emit `recommendation`, `borrow`, or `return` events.

#### Scenario: Return by chat message emits the event
- **WHEN** the user sends 「还千与千寻」 while holding an `ACTIVE` rental of it
- **THEN** the stream includes a `return` event with `success` true and the updated `remainingStock`

#### Scenario: Return homograph does not misfire
- **WHEN** the message contains 「还」 in its "still" sense with no title (for example 「还可以」)
- **THEN** no return tool runs: the rule fallback does not classify it as return, and the LLM path is not required for this outcome

#### Scenario: Unresolved return lists active rentals
- **WHEN** a return intent cannot be resolved to a unique title
- **THEN** the reply text names the user's current `ACTIVE` rentals (or states none are held) and no `return` event is emitted

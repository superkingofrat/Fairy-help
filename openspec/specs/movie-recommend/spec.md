# movie-recommend Specification

## Purpose

Ranks in-stock catalog titles that match the user's stated mood and/or scene, optionally using saved genre likes, and returns them as recommendation cards on the chat stream.

## Requirements

### Requirement: Recommend only in-stock mood/scene matches
When the request is classified as recommend, the system SHALL return movies whose `stock` is greater than 0 and whose mood or scene tags intersect the labels parsed from the message. Movies with `stock` equal to 0 MUST NOT appear. At most 5 movies MUST be returned. If none match, the system MUST send apologetic `text` and MUST NOT send a `recommendation` event.

#### Scenario: Rainy-day query excludes zero stock
- **WHEN** the user message includes the scene label `雨天` and the catalog has matching titles some of which have `stock` 0
- **THEN** any `recommendation` items all have `stock` greater than 0 and include only titles whose scene or mood intersects the parsed labels

#### Scenario: No matching in-stock titles
- **WHEN** parsed labels match no in-stock movie
- **THEN** the stream has `text` explaining no recommendation and has no `recommendation` event

### Requirement: Profile likes only reorder results
When a profile exists for the caller, the system SHALL sort matches so movies whose `genres` overlap `likeGenres` rank higher. Missing profile MUST NOT block recommendations; tag filters still apply. A successful recommendation MUST append a behavior-log recommend record for that user.

#### Scenario: Seed profile prefers overlapping genres
- **WHEN** the seeded `dev-user` profile includes a liked genre that some matching movies share
- **THEN** those overlapping-genre movies appear before otherwise equal matches that share no liked genre

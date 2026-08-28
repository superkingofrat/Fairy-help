# user-profile Specification

## Purpose

Stores a durable persona (genre likes, tags, travel and diet notes) for users so recommendations can read preferences and operators can maintain profiles over HTTP.

## Requirements

### Requirement: Seeded profile is readable for dev-user
After database seed, the user id used by the `dev-user` stub (`00000000-0000-4000-8000-000000000001`) MUST have a profile whose `likeGenres` is non-empty. Chat recommend and borrow MUST load this profile by that user id when present. This change MUST NOT ship profile create/update HTTP APIs or an admin profile editor.

#### Scenario: Seed aligns with auth stub
- **WHEN** seed has been applied and a recommend request runs as `dev-user`
- **THEN** the handler can read a profile for `00000000-0000-4000-8000-000000000001` that includes at least one `likeGenres` value

#### Scenario: Missing profile does not abort recommend
- **WHEN** a user id has no profile row
- **THEN** recommend still returns tag-filtered in-stock movies when matches exist

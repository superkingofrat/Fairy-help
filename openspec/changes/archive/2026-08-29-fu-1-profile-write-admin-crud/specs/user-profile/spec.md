## MODIFIED Requirements

### Requirement: Seeded profile is readable for dev-user
After database seed, the user id used by the `dev-user` stub (`00000000-0000-4000-8000-000000000001`) MUST have a profile whose `likeGenres` is non-empty. Chat recommend and borrow MUST load this profile by that user id when present. Admin create/update of profiles MUST NOT remove this seed invariant.

#### Scenario: Seed aligns with auth stub
- **WHEN** seed has been applied and a recommend request runs as `dev-user`
- **THEN** the handler can read a profile for `00000000-0000-4000-8000-000000000001` that includes at least one `likeGenres` value

#### Scenario: Missing profile does not abort recommend
- **WHEN** a user id has no profile row
- **THEN** recommend still returns tag-filtered in-stock movies when matches exist

## ADDED Requirements

### Requirement: Profile HTTP resource is plural `/api/profiles`
The public API MUST use `/api/profiles` (list, item, create, patch). The previously documented singular `/api/profile/:userId` MUST NOT be served. All responses MUST use `{ code, data, msg }`. The system MUST NOT expose `DELETE` for profiles or users in this change. The system MUST NOT create `User` rows via this API.

#### Scenario: Singular path is not the profile API
- **WHEN** a client calls the unimplemented historical singular profile path
- **THEN** it MUST NOT receive a successful profile document from a dedicated singular profile router (the canonical resource is `/api/profiles`)

#### Scenario: Delete is not offered
- **WHEN** a client sends `DELETE /api/profiles/:userId`
- **THEN** the system MUST NOT delete a profile or user as a supported operation

### Requirement: Admin lists every user with optional profile
An admin MUST retrieve a list of every existing user. Each item MUST include `userId`, `email`, `role`, and `profile` which is either a full profile document or `null`. Non-admin callers MUST receive `403` with code `FORBIDDEN`. Pagination is not required.

#### Scenario: Seed users appear including missing profile
- **WHEN** an admin lists profiles after seed
- **THEN** the list includes the seeded `dev-user` with a non-null profile and the seeded `dev-admin` with `profile` null

#### Scenario: User role cannot list
- **WHEN** a `user` role requests the profile list
- **THEN** the response status is 403 and `code` is `FORBIDDEN`

### Requirement: Owner or admin can read one profile
`GET /api/profiles/:userId` MUST return the profile when it exists and the caller is the owner or an admin. A missing profile MUST return 404 with code `PROFILE_NOT_FOUND`. A non-UUID `userId` MUST return 400 with code `INVALID_USER_ID`. A caller who is neither owner nor admin MUST receive 403 `FORBIDDEN`.

#### Scenario: Dev-user reads own seeded profile
- **WHEN** the `user` role requests `GET /api/profiles/00000000-0000-4000-8000-000000000001`
- **THEN** the response is 200 and `data.name` identifies the seeded persona

#### Scenario: User cannot read another user's profile
- **WHEN** the `user` role requests `GET /api/profiles/` for a different existing user id
- **THEN** the response is 403 `FORBIDDEN`

### Requirement: Admin creates profile only for existing users without one
An admin MUST create a profile for an existing user who has none. The body MUST include that `userId` and writable profile fields; `name` MUST be a non-empty string. Writable fields are `name`, `avatarUrl`, `styleTags`, `likeGenres`, `avoidFood`, `dietPreference`, and `travelStyle`. Array fields MUST accept free strings (including empty arrays). Empty `avatarUrl` MUST be stored as null. A missing user MUST return 404 `USER_NOT_FOUND`. An existing profile MUST return 409 `PROFILE_ALREADY_EXISTS`. Non-admin MUST receive 403 `FORBIDDEN`. Invalid body MUST return 400 `VALIDATION_ERROR`.

#### Scenario: Fill profile for admin user
- **WHEN** an admin posts a valid profile body for the seeded admin user id that has no profile
- **THEN** the response is success and a subsequent list row for that user has a non-null profile

#### Scenario: Duplicate create is rejected
- **WHEN** an admin posts a create for a user who already has a profile
- **THEN** the response is 409 and `code` is `PROFILE_ALREADY_EXISTS`

### Requirement: Admin patches existing profile
An admin MUST partially update an existing profile by `userId`. The `userId` identity MUST NOT change. A missing profile MUST return 404 `PROFILE_NOT_FOUND`. Non-admin MUST receive 403 `FORBIDDEN`. After a successful patch of `likeGenres`, a later recommend for that user MUST rank using the updated likes with exact genre overlap.

#### Scenario: Genre likes persist and affect recommend order
- **WHEN** an admin patches the seeded `dev-user` profile `likeGenres` to a new non-empty list and a recommend runs for that user with the same mood or scene filters
- **THEN** GET of that profile returns the new `likeGenres` and overlapping-genre movies rank above otherwise equal matches that share none

### Requirement: Admin profile page can list, create, and edit
The web app MUST provide `/admin/profiles` in the same navigation area as `/admin/movies`. The page MUST list one row per user, allow creating a profile when `profile` is null, and allow editing when a profile exists. Comma-separated inputs MUST map to the string-array fields. Loading, error, and empty states MUST be visible. User-facing copy MUST come from zh-CN i18n. The chat page MUST NOT gain a self-serve profile editor.

#### Scenario: Operator completes create and edit
- **WHEN** an admin opens `/admin/profiles` after seed
- **THEN** they can see at least two user rows, edit the seeded persona, and create a profile for a user whose profile is null, with validation errors shown on the page

# user-auth Specification

## Purpose

Authenticates users with email and bcrypt-hashed passwords, issues short-lived HS256 JWTs, and enforces Bearer-only access on every business endpoint so identity comes from a verified token instead of a dev header stub.

## Requirements

### Requirement: Login issues a signed JWT and me restores the session
The system MUST expose `POST /api/auth/login` accepting email and password (Zod-validated), verify the password against the stored bcrypt hash, and on success return `{ token, refreshToken, user: { id, email, role } }` where `token` is an HS256 JWT signed with `JWT_SECRET`, carrying `{ userId, role }` and expiring in 12 hours, and `refreshToken` is an opaque random token stored hashed and bound to the user for later renewal. Wrong password and unknown email MUST both return 401 `UNAUTHORIZED` with an identical response body (no user enumeration). The system MUST expose `GET /api/auth/me` returning the authenticated user's summary from a valid token. Seeded users MUST authenticate with their documented dev passwords; stored passwords MUST be bcrypt hashes (never plaintext).

#### Scenario: Successful login returns a usable token
- **WHEN** the seeded user logs in with the correct email and password
- **THEN** the response contains a token and the user summary, and the token authenticates business endpoints

#### Scenario: Wrong credentials are indistinguishable
- **WHEN** the password is wrong or the email does not exist
- **THEN** both cases return the same 401 `UNAUTHORIZED` body

#### Scenario: Me restores the session
- **WHEN** a valid token is presented to `GET /api/auth/me`
- **THEN** the response returns that user's id, email, and role

#### Scenario: Login returns a refresh token
- **WHEN** a user logs in successfully
- **THEN** the response includes a refresh token that can later be exchanged for a new access token

### Requirement: Bearer-only middleware replaces the dev stub
Every business endpoint MUST accept only `Authorization: Bearer <jwt>`: the middleware MUST verify signature and expiry, inject the token's `userId` and `role`, and reject missing, malformed, expired, or forged tokens with 401 `UNAUTHORIZED`. The `X-Dev-Role` header and `Bearer dev-<role>` tokens MUST NOT authenticate anything. Role checks (admin-only list/write, owner-or-admin reads) MUST keep their existing semantics, returning 403 `FORBIDDEN` for authenticated non-admin callers. The chat speaker MUST be the logged-in user's id from the token.

#### Scenario: Dev stub headers are dead
- **WHEN** a client sends `X-Dev-Role: admin` or `Authorization: Bearer dev-admin` without a real token
- **THEN** every business endpoint responds 401 `UNAUTHORIZED`

#### Scenario: Role boundary holds under JWT
- **WHEN** a user-role token calls an admin-only endpoint
- **THEN** the response is 403 `FORBIDDEN`, while the same endpoint succeeds with an admin token

#### Scenario: Chat speaker is the logged-in user
- **WHEN** a logged-in user borrows a movie via chat
- **THEN** the created rental and behavior-log rows carry the token subject's user id

### Requirement: JWT_SECRET is mandatory at startup
The API MUST refuse to start when `JWT_SECRET` is missing or empty, and `.env.example` MUST document it as required.

#### Scenario: Missing secret blocks startup
- **WHEN** the API starts without `JWT_SECRET`
- **THEN** startup fails with a clear validation message before listening

### Requirement: Web login page and route guards
The web app MUST provide a `/login` page (email + password, inline error display, zh-CN i18n), persist the session (token + user + refreshToken) in a client store backed by localStorage, and guard routes: `/chat` requires a session, `/admin/*` requires the admin role, and unauthorized access MUST redirect to `/login`. All API clients MUST attach `Authorization: Bearer` from the store; on 401, clients MUST attempt a single-flight refresh with the stored refresh token and retry the request once, clearing the session and redirecting to `/login` only when the refresh fails. Navigation MUST render admin links only for admin users, with login/logout affordances.

#### Scenario: Guard redirects unauthenticated access
- **WHEN** a visitor without a session opens `/admin/movies`
- **THEN** the app redirects to `/login`

#### Scenario: Role-scoped navigation
- **WHEN** a user-role account is logged in
- **THEN** admin navigation links are not rendered, and `/chat` is available

#### Scenario: Expired session is handled
- **WHEN** any API client receives 401 while a session exists
- **THEN** the session is cleared and the app redirects to `/login`

#### Scenario: Expired access token renews silently
- **WHEN** an API client receives 401 while a refresh token exists
- **THEN** the client exchanges the refresh token once and retries the original request without user interaction

#### Scenario: Failed refresh signs the user out
- **WHEN** the refresh token is invalid or expired
- **THEN** the session is cleared and the app redirects to `/login`

### Requirement: Self-service registration
The system MUST expose `POST /api/auth/register` accepting `{ email, password }` (Zod-validated; password 6-72 characters), hash the password with bcrypt, and create a `user`-role account. A duplicate email MUST fail with 409 `EMAIL_ALREADY_EXISTS`. Registration MUST NOT create a profile, MUST NOT allow admin role selection, and on success MUST return 201 with the same shape as login (`{ token, refreshToken, user }`).

#### Scenario: Register a new account returns a session
- **WHEN** a visitor registers with a new email and a valid password
- **THEN** a user-role account is created and the response is 201 with token, refreshToken, and user summary

#### Scenario: Duplicate email is rejected
- **WHEN** a visitor registers with an email that already exists
- **THEN** the request fails with 409 `EMAIL_ALREADY_EXISTS` and no new account is created

#### Scenario: Invalid input is rejected
- **WHEN** the email format is invalid or the password is shorter than 6 characters
- **THEN** the request fails with 400 `VALIDATION_ERROR`

### Requirement: Refresh tokens rotate and can be revoked
The system MUST store refresh tokens in the database as hashes, issue one with every successful login/registration, and expose `POST /api/auth/refresh` that exchanges a valid refresh token for a new `{ token, refreshToken, user }` while invalidating the presented token (rotation). Presenting an already-rotated or revoked refresh token MUST fail with 401 `INVALID_REFRESH_TOKEN` and revoke every outstanding refresh token of that user. `POST /api/auth/logout` MUST revoke the presented refresh token so it can no longer be used.

#### Scenario: Refresh rotates the token pair
- **WHEN** a valid refresh token is presented to refresh
- **THEN** a new access token and refresh token are returned and the presented token can no longer be used

#### Scenario: Reuse of a rotated token forces re-login
- **WHEN** a rotated or revoked refresh token is presented again
- **THEN** the request fails with 401 `INVALID_REFRESH_TOKEN` and all of the user's refresh tokens are revoked

#### Scenario: Logout revokes the session
- **WHEN** a user logs out with their refresh token
- **THEN** that token can no longer be used to refresh

### Requirement: Login and registration are rate-limited
The system MUST rate-limit `POST /api/auth/login` and `POST /api/auth/register` per client IP and respond 429 `TOO_MANY_REQUESTS` with a friendly message once the limit is exceeded. Limits MUST be applied before credential verification and MUST NOT require storing plaintext credentials.

#### Scenario: Excessive login attempts are throttled
- **WHEN** more than the allowed number of login attempts arrive from one IP within the window
- **THEN** subsequent attempts fail with 429 `TOO_MANY_REQUESTS`

#### Scenario: Registration is throttled
- **WHEN** more than the allowed number of registration attempts arrive from one IP within the window
- **THEN** subsequent attempts fail with 429 `TOO_MANY_REQUESTS`

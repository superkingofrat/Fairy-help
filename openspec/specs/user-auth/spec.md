# user-auth Specification

## Purpose

Authenticates users with email and bcrypt-hashed passwords, issues short-lived HS256 JWTs, and enforces Bearer-only access on every business endpoint so identity comes from a verified token instead of a dev header stub.

## Requirements

### Requirement: Login issues a signed JWT and me restores the session
The system MUST expose `POST /api/auth/login` accepting email and password (Zod-validated), verify the password against the stored bcrypt hash, and on success return `{ token, user: { id, email, role } }` where `token` is an HS256 JWT signed with `JWT_SECRET`, carrying `{ userId, role }` and expiring in 12 hours. Wrong password and unknown email MUST both return 401 `UNAUTHORIZED` with an identical response body (no user enumeration). The system MUST expose `GET /api/auth/me` returning the authenticated user's summary from a valid token. Seeded users MUST authenticate with their documented dev passwords; stored passwords MUST be bcrypt hashes (never plaintext).

#### Scenario: Successful login returns a usable token
- **WHEN** the seeded user logs in with the correct email and password
- **THEN** the response contains a token and the user summary, and the token authenticates business endpoints

#### Scenario: Wrong credentials are indistinguishable
- **WHEN** the password is wrong or the email does not exist
- **THEN** both cases return the same 401 `UNAUTHORIZED` body

#### Scenario: Me restores the session
- **WHEN** a valid token is presented to `GET /api/auth/me`
- **THEN** the response returns that user's id, email, and role

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
The web app MUST provide a `/login` page (email + password, inline error display, zh-CN i18n), persist the session (token + user) in a client store backed by localStorage, and guard routes: `/chat` requires a session, `/admin/*` requires the admin role, and unauthorized access MUST redirect to `/login`. All API clients MUST attach `Authorization: Bearer` from the store and, on 401, MUST clear the session and redirect to `/login`. Navigation MUST render admin links only for admin users, with login/logout affordances.

#### Scenario: Guard redirects unauthenticated access
- **WHEN** a visitor without a session opens `/admin/movies`
- **THEN** the app redirects to `/login`

#### Scenario: Role-scoped navigation
- **WHEN** a user-role account is logged in
- **THEN** admin navigation links are not rendered, and `/chat` is available

#### Scenario: Expired session is handled
- **WHEN** any API client receives 401 while a session exists
- **THEN** the session is cleared and the app redirects to `/login`

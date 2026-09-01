## Purpose

Provides store operators with an admin-only aggregate view of store operations — popular movies, borrowing trends, inventory status, mood/scene distribution, and activity — delivered as a dashboard backed by a single read-only insights endpoint.

## ADDED Requirements

### Requirement: Store insights are served to admins as an aggregate endpoint

The system MUST expose `GET /api/insights/overview`, protected by Bearer auth and restricted to the admin role, returning a single aggregated payload covering popular movies, daily borrowing trends, inventory status, mood/scene distribution, and activity overview. Non-admin roles MUST receive 403 `FORBIDDEN`; missing or invalid credentials MUST receive 401 `UNAUTHORIZED`. The endpoint MUST be read-only and MUST NOT modify business data.

#### Scenario: Admin fetches the overview

- **WHEN** an admin requests `GET /api/insights/overview` with a valid token
- **THEN** the response is 200 with the aggregated store data

#### Scenario: Non-admin is denied

- **WHEN** a user-role account requests the overview
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Unauthenticated is denied

- **WHEN** a request without a valid token hits the overview
- **THEN** the response is 401 `UNAUTHORIZED`

### Requirement: Popular movies ranking

The system MUST rank movies by their borrow count in descending order and return the top 5, each with title, borrow count, current availability (`stock > 0`), and recommendation count derived from RECOMMEND behavior logs. When no borrow data exists, the ranking MUST be an empty array.

#### Scenario: Popular movies are ranked by borrows

- **WHEN** the store has borrow records
- **THEN** the top 5 movies by borrow count are returned in descending order

#### Scenario: No borrow data

- **WHEN** the store has no borrow records
- **THEN** the ranking is an empty array

### Requirement: Daily borrowing trend

The system MUST return borrowing and return counts for each of the last 14 days (borrows bucketed by rental creation date, returns by return date), filling missing days with zero.

#### Scenario: Trend covers the window with zero-filled days

- **WHEN** an admin requests the overview
- **THEN** the trend contains one entry per day for the last 14 days, with zero for days without activity

### Requirement: Inventory status

The system MUST report the number of currently active rentals, the ratio of borrowed to total stock, and a list of low-stock movies where `stock <= 1`.

#### Scenario: Low stock movies are surfaced

- **WHEN** some movies have stock of 1 or 0
- **THEN** they appear in the low-stock list with their remaining stock

### Requirement: Mood and scene distribution

The system MUST count the moods and scenes of movies borrowed in the last 30 days and return the top 5 of each, including only dimensions that have data. When no data exists, the distributions MUST be empty arrays.

#### Scenario: Distributions reflect recent borrows

- **WHEN** movies with mood/scene tags were borrowed in the last 30 days
- **THEN** the top 5 moods and scenes by borrow count are returned

#### Scenario: No recent borrows

- **WHEN** no movies were borrowed in the last 30 days
- **THEN** both distributions are empty arrays

### Requirement: Activity overview

The system MUST report the total user count, the number of distinct users active in the last 7 days (with behavior logs), and the number of users registered in the last 7 days.

#### Scenario: Activity metrics are returned

- **WHEN** an admin requests the overview
- **THEN** the payload includes total users, 7-day active users, and 7-day new registrations

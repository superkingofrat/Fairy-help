# agent-chat Specification

## Purpose

Provides the authenticated streaming chat entry so a user can send a message or structured borrow request and receive Fairy replies plus structured events without a blocking JSON body.

## Requirements

### Requirement: Chat uses SSE after a valid request body
The system SHALL accept `POST /api/chat` with JSON `{ message: string, movieId?: uuid, sessionId?: string }`. On success the response MUST use `Content-Type: text/event-stream`. Validation failures MUST return JSON `{ code, data, msg }` with `code` `VALIDATION_ERROR` and HTTP 400. The system MUST NOT expose a working `POST /api/borrow` business route in this change.

#### Scenario: Valid recommend message streams events
- **WHEN** an authenticated `dev-user` posts a message containing a known mood or scene label
- **THEN** the response is an event stream that includes at least one `text` event and, when in-stock matching movies exist, a `recommendation` event whose `items` length is between 1 and 5, followed by a `done` event

#### Scenario: Invalid body is JSON not stream
- **WHEN** the client posts a body that fails schema validation
- **THEN** the system returns HTTP 400 JSON with `code` `VALIDATION_ERROR` and does not start an event stream

### Requirement: Intent priority is movieId then title-borrow then tags then unmatched
The system SHALL classify each request in this order: (1) valid `movieId` is borrow; (2) else if the message is a borrow-by-title request, resolve titles; (3) else if the message contains at least one mood or scene enum label as a substring, it is recommend; (4) else unmatched. Unmatched MUST emit only guiding `text` and `done`, MUST NOT emit `recommendation` or `borrow`, and MUST NOT create rental or behavior-log rows.

#### Scenario: Unrecognized small talk
- **WHEN** the user sends a message with no mood/scene label and no borrow intent (for example asking the weekday)
- **THEN** the stream contains guiding `text` mentioning mood/scene or card borrow, contains no `recommendation` event, and no new rental or behavior log is stored

### Requirement: Chat UI consumes the stream
The web app SHALL provide a `/chat` page that sends `POST /api/chat` with the stub user identity, renders streamed `text`, renders recommendation cards, and on card borrow resubmits the same endpoint with `movieId`. Chrome labels MUST come from the web locale files.

#### Scenario: Card borrow sends movieId
- **WHEN** the user clicks borrow on a recommendation card
- **THEN** the client posts `movieId` set to that movie's id on `POST /api/chat`

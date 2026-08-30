## MODIFIED Requirements

### Requirement: Chat UI consumes the stream
The web app SHALL provide a `/chat` page that sends `POST /api/chat` with the logged-in user's identity (Bearer token from the auth store), renders streamed `text`, renders recommendation cards, and on card borrow resubmits the same endpoint with `movieId`. Chrome labels MUST come from the web locale files.

#### Scenario: Card borrow sends movieId
- **WHEN** the user clicks borrow on a recommendation card
- **THEN** the client posts `movieId` set to that movie's id on `POST /api/chat`

#### Scenario: Chat requires an authenticated session
- **WHEN** a visitor without a session opens `/chat`
- **THEN** the app redirects to `/login` instead of rendering the chat page

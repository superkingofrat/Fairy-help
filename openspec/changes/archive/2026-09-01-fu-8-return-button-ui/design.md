## Context

See `proposal.md` and `specs/movie-rental/spec.md`. Return capability already shipped in FU-4 (`rentalService.returnRental` + `returnMovieTool` + SSE `return` event + `synthesize` return branch). `rentalsRouter` is an unmounted placeholder. `chatRequestSchema` = `{ message, movieId?, sessionId? }` (no `action`). `stateLoop.runChatTurn` = `{ userId, message, movieId? }`. Web: `chatStore` is a stub, `ChatPage` owns local message state, `RecommendationCard` has a single borrow button, `postChat` in `chatApi` streams SSE.

## Goals / Non-Goals

**Goals:**

- One read port for rental state: `GET /api/rentals` with owner/admin semantics, feeding both the strip and the card toggle from one fetch.
- One-click return is a deterministic chat request (`{ movieId, action: "return" }`) that reuses the FU-4 tool + synthesis — no new return logic, no LLM on the action path.
- Web state source of truth = server: refetch on mount and after each turn; optimistic removal only as a UX nicety, corrected by refetch.

**Non-Goals:**

- REST write path for returns; admin UI for rentals (API 代查 only); pagination; overdue/fines; changing the existing text-based return intent flow.

## Decisions

1. **Mount `GET /api/rentals` under `authMiddleware`, replace the placeholder POST**
   Why: placeholder exists to be filled; borrow router already mounts the same way. Keep `rentalsRouter` file, swap body.
   Alternative: new router file — no, the placeholder is exactly this resource.

2. **Query in `rentalService.listRentals(userId, opts)` with `include: { movie: { select: { title } } }`**
   Why: title resolution via FK include is one query, no N+1; read-only so no transaction needed.
   Alternative: title map via `movieService` — extra round trip; Prisma include is the established pattern.

3. **Admin 代查 in controller: role check → UUID validate → `user.findUnique` → 404 → list by target id**
   Why: `INVALID_USER_ID` for non-UUID (profiles precedent), `USER_NOT_FOUND` for missing user (borrow 404 precedent), 403 for non-admin with `?userId=` (profiles precedent). `?status` validated as `z.enum(["ACTIVE"])` — other values 400.
   Alternative: let Prisma `findMany({ where: { userId: bad-uuid } })` throw → 500. Rejected: explicit validation keeps error contract stable.

4. **chat `action` = `z.enum(["return"]).optional()` + `.refine(action → movieId present)`**
   Why: strict per grill-me Q2; refine runs after uuid check so `action` + bad movieId still yields `VALIDATION_ERROR`.
   Alternative: make `action` a union validator — same result, more code; refine is the idiomatic cross-field constraint.

5. **`stateLoop`: `action === "return" && movieId` → call `returnMovieTool` directly, build the same `ToolObservation` dispatch builds, reuse `synthesize`**
   Why: zero new reply/SSE logic — the FU-4 return branch already emits `text` + `return` event for both success and failure (including the apologetic text for `RENTAL_NOT_FOUND`).
   Alternative: run through `classifyIntent` with a forced rule — leaks intent-classifier semantics into a deterministic path; direct call is clearer and testable.

6. **Web: `chatStore` gains `activeRentals` + `refreshRentals()`; `ChatPage` strips + cards read from it**
   Why: strip and card toggle need the same set; a store avoids prop-drilling and lets the SSE handler update state in one place. Refetch on mount + after every `done`.
   Alternative: local state in ChatPage — duplicated fetch logic with the card toggle; store is the draft's frozen choice.

7. **`RecommendationCard` gets `isBorrowed` + `onReturn`; return button ignores `stock < 1`**
   Why: an active rental means the copy is physically out with this user — return is always legal (grill-me Q3/Q4).
   Alternative: keep single button with conditional label — muddies disabled semantics; two explicit handlers is clearer.

## Risks / Trade-offs

- [Strip + card both call `send` and both refetch → double refetch per turn] → one refetch in `send`'s finally/`done`, not per handler.
- [Optimistic chip removal races a concurrent return failure] → SSE `return` failure path triggers `refreshRentals()`; server is authoritative.
- [`?status` enum only `ACTIVE` today] → future statuses (`RETURNED` filter) extend the shared enum; z enum rejects unknown values with 400 rather than silently.
- [Admin 代查 returns full history (no pagination)] → per-user rental counts are small; FU-7 may revisit for session history.
- [chatStore gains state but `messages` field stays unused] → leave untouched; not this change's concern.

## Migration Plan

- No database migration. Deploy shared (schema) + api (routes, stateLoop) + web (strip, card, store) together.
- Rollback: unmount rentals router, drop `action` from schema, revert strip/card additions; existing rentals data unaffected.
- Docs: `API_CONTRACT.md` §3.11 rentals + chat request `action`; `ARCHITECTURE.md` §5.2/§8 rentals read port note.

## Open Questions

None that affect specs or task breakdown.

## 1. Shared contract

- [ ] 1.1 Add `action: z.enum(["return"]).optional()` to `chatRequestSchema` with `.refine` requiring `movieId` when `action` is present; export updated `ChatRequestInput`
- [ ] 1.2 Add `rentalsQuerySchema` (`status` = `z.enum(["ACTIVE"])` optional) + `RentalListItem` type (rentalId, movieId, movieTitle, status, borrowedAt, returnedAt?) to shared
- [ ] 1.3 Update `chatSchemas.test.ts`: action + movieId passes, action without movieId rejected, invalid action rejected; rebuild shared

## 2. API: rentals query endpoint

- [ ] 2.1 Add `listRentals(userId, opts?: { status?: "ACTIVE" })` to `rentalService` (`findMany` + `include: { movie: { select: { title } } }`, `createdAt` desc, map to `RentalListItem`)
- [ ] 2.2 Create `rentalsController`: `GET /` — non-admin with `?userId=` → 403; admin with `?userId=` → uuid validate (400 `INVALID_USER_ID`) → user exists (404 `USER_NOT_FOUND`) → list; otherwise list caller's own
- [ ] 2.3 Replace `rentalsRouter` placeholder with `GET /` calling the controller; mount `app.use("/api/rentals", authMiddleware, rentalsRouter)` in app.ts
- [ ] 2.4 Add `rentals.test.ts`: own 200 with movieTitle + desc order, `?status=ACTIVE` filter, admin 代查, 404 `USER_NOT_FOUND`, 400 `INVALID_USER_ID`, non-admin 403, 401 without token

## 3. API: chat deterministic return path

- [ ] 3.1 Extend `runChatTurn` input with `action?: "return"`; when `action === "return" && movieId`, call `returnMovieTool` directly, build the same `ToolObservation` as `dispatch`'s return branch, and reuse `synthesize` (no intent classification)
- [ ] 3.2 Pass `action` through the chat route (`chatRequestSchema` already validates); ensure route emits `return` + `text` for success and apologetic `text` for failure with no 500
- [ ] 3.3 Add chat tests: `{ movieId, action: "return" }` returns + returns event without matching intent text; `{ action: "return" }` without movieId → 400 `VALIDATION_ERROR`; failure (no active rental) → apologetic text, no 500

## 4. Web: rentals state and UI

- [ ] 4.1 Create `rentalsApi.ts` (Bearer + 401 handling, `listRentals({ status })`); extend `chatApi.postChat` body type with `action?: "return"`
- [ ] 4.2 Extend `chatStore` with `activeRentals` + `refreshRentals()` (GET `?status=ACTIVE`); keep existing fields untouched
- [ ] 4.3 `ChatPage`: refresh on mount and after each turn's `done`; handle SSE `return` event (success → remove rentalId from `activeRentals`; failure → `refreshRentals()`); render「我的借阅」strip (title chip + return button, pending disabled, hidden when empty) sending `{ message: "", movieId, action: "return" }`
- [ ] 4.4 `RecommendationCard`: add `isBorrowed` + `onReturn`; borrowed → show「归还」(enabled regardless of stock), else「借阅」; wire from ChatPage with `activeRentals` membership
- [ ] 4.5 i18n: add `chat.return` / `chat.myRentals` / `chat.returning` keys to zh-CN.json (+ en if present)
- [ ] 4.6 Web tests: strip renders active rentals and hides when empty; return click sends `{ movieId, action: "return" }`; card toggles borrow/return by `isBorrowed`

## 5. Docs & verification

- [ ] 5.1 `API_CONTRACT.md`: add §3.11 `GET /api/rentals` (auth, `?status`, `?userId`, errors, row shape) + chat request `action` field
- [ ] 5.2 `ARCHITECTURE.md`: §5.2/§8 note rentals read port (chat tool + REST share the write path; rentals read port is REST-only)
- [ ] 5.3 Full verification: four-package tests + typechecks + `openspec validate`; mark tasks complete

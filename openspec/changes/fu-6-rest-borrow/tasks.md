## 1. Shared contracts

- [x] 1.1 Add `borrowRequestSchema` (`movieId: uuid`) + type to `rentalSchemas`; export

## 2. API

- [x] 2.1 `borrowController` + `borrowRouter` (`POST /borrow` under `/api/borrow`, `validateBody(borrowRequestSchema)`, calls `borrowMovieTool`, maps ok → 201 / `MOVIE_NOT_FOUND` → 404 / `ALREADY_BORROWED`|`OUT_OF_STOCK` → 409); mount on `createApp`
- [x] 2.2 Route tests: 201 success (tool called with token subject), 404, 409 ×2, 400 invalid uuid, 401 unauthenticated, body userId ignored, behavior-log written

## 3. Docs and verification

- [x] 3.1 `API_CONTRACT.md`: new borrow endpoint section, remove from §5; `ARCHITECTURE.md` §8 revision + §5.2 dual-entry note
- [x] 3.2 Run api tests + typecheck; web regression (zero-change check)

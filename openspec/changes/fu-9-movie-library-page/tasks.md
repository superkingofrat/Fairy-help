## 1. Web: API client

- [x] 1.1 Add `borrowMovie(movieId)` to `lib/movieApi.ts` (Bearer + 401 redirect, parse `{ code, data, msg }`, throw typed errors for `ALREADY_BORROWED` / `OUT_OF_STOCK` / `MOVIE_NOT_FOUND`)
- [x] 1.2 Reuse existing `listRentals({ status: "ACTIVE" })` from `lib/rentalsApi.ts` for the borrowed set (no new client needed)

## 2. Web: MovieLibraryPage

- [x] 2.1 Add `/movies` route (RequireAuth, user+admin) + `nav.movies` nav entry in `App.tsx` and i18n
- [x] 2.2 Add `library.*` i18n keys (zh-CN): title, search, mood, scene, keyword, reset, borrow, borrowed, borrowOk, error maps
- [x] 2.3 Add `components/library/MovieCard.tsx`: title/director/year/mood/scene/stock + button with states `idle | borrowing | borrowed | error` (borrowed → disabled label「已借」; error → in-card message)
- [x] 2.4 `MovieLibraryPage`: catalog fetch via `fetchMovies(page)` with pagination controls (prev/next + page); loading/empty/error states
- [x] 2.5 Filter toolbar: mood/scene chip selects + keyword input + search/reset → compose `searchMovies({ mood, scene, keyword, page, limit })`; reset → back to `fetchMovies`
- [x] 2.6 Borrowed set: fetch `listRentals({ status: "ACTIVE" })` on mount → `borrowedIds` Set; mark cards borrowed/disabled
- [x] 2.7 Borrow click: `borrowMovie(movieId)` with per-card pending; success → mark borrowed + refetch rentals + top success hint; failure (`ALREADY_BORROWED`/`OUT_OF_STOCK`) → card error message; no 500, no chat involvement

## 3. Web: tests

- [x] 3.1 `App.test.tsx`: nav shows「影片库」for user and admin; `/movies` guarded without token
- [x] 3.2 `MovieLibraryPage.test.tsx`: renders paginated catalog; filters compose search URL params; reset returns to catalog; borrow success → card marked borrowed; borrow failure → in-card friendly error; borrowed set disables buttons; no return control rendered

## 4. Docs & verification

- [x] 4.1 `ARCHITECTURE.md`: §5 data-flow note — user-side library page consumes the REST borrow bypass (FU-6) for direct borrowing; return remains chat-only
- [x] 4.2 Full verification: web tests + typecheck + `openspec validate`; mark tasks complete

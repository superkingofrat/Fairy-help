## 1. Data layer

- [x] 1.1 Add Prisma `Profile`, `Rental` (`ACTIVE`/`RETURNED`), `BehaviorLog`; User relations; unique active rental per user+movie
- [x] 1.2 Create migration `add_profile_rental_behavior_log` and run `pnpm --filter=@fairy/database generate`
- [x] 1.3 Seed users at stub UUIDs (`...0001` user, `...0002` admin) plus agent Profile with `likeGenres` overlapping seed movies

## 2. Shared contracts

- [x] 2.1 Add chat request Zod schema (`message`, optional `movieId`, optional `sessionId`)
- [x] 2.2 Add SSE event types for `text`, `recommendation`, `borrow`, `done`
- [x] 2.3 Replace stub Profile/Rental shared types and schemas
- [x] 2.4 Add shared schema unit tests

## 3. Services

- [x] 3.1 Implement `ProfileService.getByUserId` (null if missing)
- [x] 3.2 Implement `BehaviorLogService.append`
- [x] 3.3 Implement `RentalService.borrow` in a transaction with conditional stock decrement

## 4. Agent and tools

- [x] 4.1 Implement rule `intentClassifier` (movieId → title borrow → mood/scene → unmatched)
- [x] 4.2 Implement `recommendMovieTool` (in-stock tag filter, likeGenres sort, max 5)
- [x] 4.3 Implement `borrowMovieTool` calling only `RentalService`; resolve titles in classifier
- [x] 4.4 Wire `planner`, `toolDispatcher`, `responseSynthesizer`, `stateLoop` with templates; no `@fairy/ai-sdk` runtime calls

## 5. HTTP chat

- [x] 5.1 Implement `POST /api/chat` SSE writer from state loop
- [x] 5.2 Mount route on `createApp` with `authMiddleware`
- [x] 5.3 Ensure `POST /api/borrow` is not mounted

## 6. Web

- [x] 6.1 Implement `useSSE` event parser
- [x] 6.2 Implement `ChatPage`, `MessageStream`, `RecommendationCard` with i18n chrome
- [x] 6.3 Register `/chat` route and nav; send stub `dev-user` headers

## 7. Tests and docs

- [x] 7.1 API tests: recommend, stock 0 excluded, borrow success, `ALREADY_BORROWED`, `OUT_OF_STOCK`, unmatched no logs (test DB)
- [x] 7.2 Web test: card borrow posts `movieId`
- [x] 7.3 Update `API_CONTRACT.md` (chat current, REST borrow future) and `ARCHITECTURE.md` (rules, no Session table)
- [x] 7.4 Run `pnpm --filter=@fairy/api test` and `pnpm --filter=@fairy/web test`

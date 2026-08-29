## 1. Shared contracts

- [x] 1.1 Add `ReturnErrorCode` ("RENTAL_NOT_FOUND") to `rentalTypes`, `ReturnSseEvent` to `chatTypes`, `RETURN_SUCCESS` to `BEHAVIOR_ACTIONS`; export

## 2. Database

- [x] 2.1 Add `RETURN_SUCCESS` to `BehaviorAction` enum in `schema.prisma`; migration `add_return_success_action` (dev DB unreachable at apply time — migration file committed, `migrate deploy` deferred to联调)

## 3. API

- [x] 3.1 `rentalService.returnRental(userId, movieId)` (transaction: findFirst ACTIVE → RENTAL_NOT_FOUND → status RETURNED → stock increment) + `listActiveRentals(userId)` (ACTIVE rentals with movie titles)
- [x] 3.2 `returnMovieTool` mirroring borrowMovieTool (calls returnRental, logs RETURN_SUCCESS on success)
- [x] 3.3 Agent chain: intentClassifier `return` intent (LLM schema + rule 「还」+unique title branch), planner/dispatcher `kind: "return"` observation, responseSynthesizer return branches (success / RENTAL_NOT_FOUND / unresolved lists active rentals), stateLoop wiring
- [x] 3.4 Chat route emits the `return` SSE event

## 4. Tests

- [x] 4.1 Service tests: successful return restocks + closes rental, no-active-rental → RENTAL_NOT_FOUND (no stock change), repeat return idempotent, listActiveRentals
- [x] 4.2 Route/intent tests: chat 「还千与千寻」 emits `return` event with restock, 「还可以」 does not misfire (rule fallback), LLM return intent path, unresolved reply lists rentals, RETURN_SUCCESS logged
- [x] 4.3 Regression: web suites pass unchanged (zero-change check), api existing suites green

## 5. Docs and verification

- [x] 5.1 `API_CONTRACT.md` §3.7 (return event, intent order, RENTAL_NOT_FOUND in error table); `ARCHITECTURE.md` return data flow
- [x] 5.2 Run `pnpm --filter=@fairy/shared test`, `@fairy/api test`, `@fairy/web test` and typecheck for touched packages

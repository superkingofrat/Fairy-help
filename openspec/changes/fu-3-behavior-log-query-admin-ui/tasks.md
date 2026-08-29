## 1. Shared contracts

- [ ] 1.1 Add `behaviorLogSchemas` (log schema, action values, `behaviorLogQuerySchema` page/limit/action/userId) and list-item/response types; export from `packages/shared`

## 2. Database

- [ ] 2.1 Add `@@index([createdAt])` to `BehaviorLog` in `schema.prisma`; generate migration `add_behavior_log_created_at_index` (migrate dev, or commit migration file and defer `migrate deploy` to联调 if the dev DB is unreachable)

## 3. API

- [ ] 3.1 `behaviorLogService.listLogs({ page, limit, action?, userId? })` → `{ items, total }` (findMany include user + count, createdAt desc, skip/take)
- [ ] 3.2 `movieService.listMoviesByIds(ids)` → deduped `Pick<Movie, "id" | "title">[]`
- [ ] 3.3 Controller + `/api/behavior-logs` router (admin-only, validation → 400 `VALIDATION_ERROR`/`INVALID_USER_ID`), resolve `email`/`movieTitle`/`recommendCount` per item; mount on `createApp`; no mutation routes
- [ ] 3.4 API tests: admin 200 resolved feed, user 403, action filter, unknown action 400, non-UUID userId 400, userId filter, empty list, DELETE 404; light service tests with mocked `@fairy/database`

## 4. Web

- [ ] 4.1 `behaviorApi.ts` (admin stub header, same request pattern as `movieApi`/`profileApi`)
- [ ] 4.2 `/admin/behavior` page (time/email/action/movie columns, action dropdown, prev/next pagination, loading/error/empty), nav entry + i18n keys; chat page untouched
- [ ] 4.3 Web test: page renders rows/filters/empty state (mock `behaviorApi`)

## 5. Docs and verification

- [ ] 5.1 `API_CONTRACT.md` new §3.9 behavior-log feed (reuse error codes); `ARCHITECTURE.md` web admin component list
- [ ] 5.2 Run `pnpm --filter=@fairy/shared test`, `@fairy/api test`, `@fairy/web test` and typecheck for touched packages

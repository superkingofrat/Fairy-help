## 1. Shared contracts

- [x] 1.1 Add create/update/list-item Zod schemas and types for `/api/profiles` (writable fields, nullable `profile` on list rows)
- [x] 1.2 Export schemas from `packages/shared` and add schema unit tests

## 2. Profile service

- [x] 2.1 Add `listUsersWithProfiles` (`user.findMany` include profile)
- [x] 2.2 Add `createForExistingUser` (missing user / already exists / empty avatarUrl → null)
- [x] 2.3 Add `updateByUserId` (atomic partial update; missing → null)

## 3. HTTP

- [x] 3.1 Implement controllers: list (admin), get (owner or admin + UUID), POST create, PATCH; no DELETE
- [x] 3.2 Replace placeholder router; mount `/api/profiles` on `createApp` with `authMiddleware`
- [x] 3.3 Map errors: `FORBIDDEN`, `INVALID_USER_ID`, `PROFILE_NOT_FOUND`, `USER_NOT_FOUND`, `PROFILE_ALREADY_EXISTS`, `VALIDATION_ERROR`

## 4. Web

- [x] 4.1 Add `profileApi` client (admin stub header, same pattern as `movieApi`)
- [x] 4.2 Add `/admin/profiles` page: user rows, create vs edit, comma-separated arrays, loading/error/empty, i18n
- [x] 4.3 Register route and nav next to movies; do not add self-serve editor on `/chat`

## 5. Tests and docs

- [x] 5.1 API tests: user 403 on list/write; admin list seed rows; owner GET; cross-user GET 403; create then 409; PATCH likes; GET missing 404; POST unknown user 404; DELETE not supported
- [x] 5.2 Assert patched `likeGenres` change recommend ranking (service or tool test)
- [x] 5.3 Web test: profiles admin renders rows and create/edit actions (mock API)
- [x] 5.4 Update `API_CONTRACT.md` (plural resource, codes) and `ARCHITECTURE.md` list shape if needed
- [x] 5.5 Run `pnpm --filter=@fairy/shared test`, `pnpm --filter=@fairy/api test`, `pnpm --filter=@fairy/web test` (and typecheck if touched packages fail types)

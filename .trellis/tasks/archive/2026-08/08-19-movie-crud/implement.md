# Movie Library CRUD — Implementation Plan

## Checklist

### 1. Shared package
- [ ] Define `Mood`, `Scene` const arrays + types in `packages/shared/src/types/movieTypes.ts`
- [ ] Zod schemas: create, update, list query, search query in `movieSchemas.ts`
- [ ] Export from `packages/shared/src/index.ts`

### 2. Database
- [ ] Add Mood/Scene enums + Movie model to `schema.prisma`
- [ ] Add `db:seed` script with ≥5 movies
- [ ] Run `pnpm --filter=@fairy/database generate`

### 3. API middleware & wiring
- [ ] Implement dev auth in `auth.ts` + `requireRole` helper
- [ ] Implement `validateBody` usage with shared schemas
- [ ] `movieService.ts` — CRUD + search with Prisma
- [ ] `movieController.ts` — map to `{ code, data, msg }`
- [ ] `routes/movies.ts` — wire endpoints + auth
- [ ] Mount in `index.ts` at `/api/movies`

### 4. API tests
- [ ] Replace placeholder test with movie route/service tests (mock Prisma or use test DB pattern from AGENTS.md)

### 5. Web admin UI
- [ ] Add React Router + `/admin/movies` route
- [ ] `MoviesAdminPage.tsx` — table, filters, modal form, delete
- [ ] i18n keys in `zh-CN.json`
- [ ] Component test smoke test

### 6. Documentation
- [ ] Expand `API_CONTRACT.md` Movie CRUD section
- [ ] Update `PROJECT_STATUS.md` (In Progress → note implementation started)

## Validation Commands

```bash
pnpm install
pnpm --filter=@fairy/database generate
pnpm --filter=@fairy/shared typecheck
pnpm --filter=@fairy/api typecheck
pnpm --filter=@fairy/web typecheck
pnpm --filter=@fairy/api test
pnpm --filter=@fairy/web test
```

## Risky Files

- `schema.prisma` — migration must be generated, not hand-edited SQL
- `auth.ts` — must not break future JWT swap (keep interface stable)

## Review Gates

- All AC-1 through AC-8 from prd.md
- No secrets in code
- No `any` types

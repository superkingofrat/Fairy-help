# Movie Library CRUD — Technical Design

## Architecture Boundaries

```
packages/shared     → Mood/Scene enums, Zod create/update/search schemas, Movie types
packages/database   → Prisma Movie model, enums, migration, seed script
apps/api            → routes → controllers → movieService → Prisma
apps/web            → /admin/movies page, API client, i18n
```

Follow `ARCHITECTURE.md` §3.2: thin routes, logic in services. No Express types in services.

## Data Model

```prisma
enum Mood { 治愈 热血 悬疑 致郁 轻松 浪漫 }
enum Scene { 雨天 失眠夜 周末午后 独自在家 约会夜 通勤路上 }

model Movie {
  id          String   @id @default(uuid())
  title       String
  director    String
  year        Int
  moods       Mood[]
  scenes      Scene[]
  genres      String[]
  quote       String?
  stock       Int      @default(0)
  totalStock  Int      @default(0)
  coverUrl    String?
  description String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Use Prisma native enums + enum arrays (PostgreSQL). Validate 1–3 moods/scenes in Zod before service layer.

## API Contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/movies` | user, admin | `page`, `limit` query |
| GET | `/api/movies/search` | user, admin | `mood`, `scene`, `keyword`, pagination |
| GET | `/api/movies/:id` | user, admin | 404 `MOVIE_NOT_FOUND` |
| POST | `/api/movies` | admin | body via `createMovieSchema` |
| PATCH | `/api/movies/:id` | admin | partial via `updateMovieSchema` |
| DELETE | `/api/movies/:id` | admin | hard delete for MVP |

Mount routers in `apps/api/src/index.ts` under `/api/movies`.

## Auth Stub

Extend `authMiddleware`:
- Parse `X-Dev-Role` header or `Authorization: Bearer dev-admin` / `dev-user`
- Set `res.locals.userId` (fixed dev UUID) and `res.locals.role`
- Export `requireRole(...roles)` middleware for routes

Document in `apps/api/.env.example`: dev auth is not for production.

## Frontend

- Add React Router in `App.tsx` (ARCHITECTURE lists React Router 6)
- Route `/admin/movies` → `MoviesAdminPage` component
- Fetch API with `VITE_API_URL` + `X-Dev-Role: admin`
- Mood/scene multi-select (max 3), stock fields, delete confirmation dialog
- Strings in `apps/web/src/locales/zh-CN.json`

## Error Handling

All errors: `{ code, data: null | context, msg }`. Use shared error codes from `API_CONTRACT.md` where defined; add `VALIDATION_ERROR`, `FORBIDDEN` as needed.

## Compatibility

Preserve existing `/health`. Replace stub `moviesRouter` search-only handler with full implementation.

## Rollback

Revert migration if deploy fails; seed is idempotent via upsert by title or truncate+seed in dev.

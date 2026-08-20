# Movie Library CRUD — PRD

**Source:** `docs/requirements/2026-08-19-mvp-scope.md` (grill-me approved 2026-08-19)

## Goal

Deliver Fairy MVP Phase 1: full Movie catalog data layer (PostgreSQL + REST) and a single-page admin UI. Enables Phase 2 Agent recommend/borrow without AI API keys.

## Requirements

- **REQ-1** `Movie` Prisma model: `title`, `director`, `year`, `mood[]`, `scene[]`, `genres[]`, `quote`, `stock`, `totalStock`, `coverUrl`, `description`, timestamps.
- **REQ-2** mood/scene Prisma enums; 1–3 tags each per movie.
- **REQ-3** Migration + seed (≥5 sample movies).
- **REQ-4** Shared Zod schemas + Mood/Scene types in `packages/shared`.
- **REQ-5** REST: `GET /api/movies`, `GET /api/movies/:id`, `GET /api/movies/search`, `POST`, `PATCH`, `DELETE`.
- **REQ-6** All responses `{ code, data, msg }`; lists use `{ items, pagination }`.
- **REQ-7** Dev auth stub: `X-Dev-Role: admin|user` or `Bearer dev-<role>`; writes admin-only; reads user+admin.
- **REQ-8** Admin page `/admin/movies`: list, filter, modal/drawer CRUD, zh-CN i18n.
- **REQ-9** Unit tests for core CRUD and validation.
- **REQ-10** Update `API_CONTRACT.md` and `PROJECT_STATUS.md`.

## Acceptance Criteria

- **AC-1** `pnpm --filter=@fairy/database migrate:dev` creates Movie table + enums.
- **AC-2** `GET /api/movies` returns ≥5 seeded items with pagination.
- **AC-3** Search filters by mood/scene; unknown tags ignored.
- **AC-4** Non-admin POST returns 403 `FORBIDDEN`.
- **AC-5** Admin full CRUD lifecycle works.
- **AC-6** Invalid mood/scene count returns 400.
- **AC-7** Admin UI end-to-end CRUD.
- **AC-8** `pnpm --filter=@fairy/api test` and `pnpm --filter=@fairy/web test` pass.

## In Scope

Movie schema/migration/seed, shared types, REST API, dev auth, admin UI, tests, spine doc updates.

## Out of Scope

Agent chat, borrow/rental, real JWT, Profile/BehaviorLog/Trip, memory center, Docker prod.

## Key Decisions

| Item | Choice |
|---|---|
| mood | `治愈` `热血` `悬疑` `致郁` `轻松` `浪漫` |
| scene | `雨天` `失眠夜` `周末午后` `独自在家` `约会夜` `通勤路上` |
| Auth | Dev stub role header |
| Admin UI | Single page `/admin/movies` with modal form |

## Open Questions

None blocking.

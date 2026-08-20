# Database Guidelines

> Database patterns and conventions for the Fairy monorepo.

---

## Overview

- **ORM**: Prisma (`packages/database`)
- **Runtime**: PostgreSQL (local or Neon)
- **Migrations**: `pnpm --filter=@fairy/database migrate:dev`
- **Seed**: `pnpm --filter=@fairy/database db:seed`

---

## Environment: Dual `DATABASE_URL` (CRITICAL)

Prisma CLI and the API read **different** `.env` files:

| Consumer | Env file | Used for |
|---|---|---|
| Prisma migrate / generate / seed | `Fairy/packages/database/.env` | Schema migrations, client generation, seed |
| Express API (`@fairy/api`) | `Fairy/apps/api/.env` | Runtime queries via `@fairy/database` client |

**Rule:** `DATABASE_URL` in both files **must be identical**.

### Common Mistake: Migrate succeeds, API returns 500

**Symptom:** `pnpm migrate:dev` and seed work; `GET /api/movies` returns 500 or Prisma `P1001`.

**Cause:** Only one `.env` was updated (e.g., after Neon password reset).

**Fix:**

1. Copy the same `DATABASE_URL` to both `packages/database/.env` and `apps/api/.env`.
2. Restart `pnpm --filter=@fairy/api dev`.

**Prevention:** After any `DATABASE_URL` change, sync both files before verifying API endpoints. See `AGENTS.md` §9 and §15.4.

---

## Migrations

- One migration per schema change; descriptive name (e.g. `add_movie_model`).
- After editing `schema.prisma`: `generate` then `migrate:dev`.
- Never edit applied migration SQL in place; add a new migration instead.

---

## Transactions

Use Prisma `$transaction` when updating multiple related rows (rentals, stock, profile updates). Movie CRUD single-row ops use direct client calls for MVP.

---

## Testing

- Tests must use `fairy_test` database URL or run in a rolled-back transaction.
- Do not run destructive tests against the development database.

---

## Naming Conventions

- Prisma models: PascalCase (`Movie`)
- Tables: Prisma default mapping
- Enum values: project-specific (Movie mood/scene use Chinese labels per product decision)

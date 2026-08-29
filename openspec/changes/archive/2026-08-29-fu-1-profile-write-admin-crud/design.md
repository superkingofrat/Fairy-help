## Context

See `proposal.md` for motivation and `specs/user-profile/spec.md` for behavior. `Profile` / `User` already exist; `ProfileService.getByUserId` is used by recommend. `profilesRouter` is a placeholder and is not mounted. Movies admin (`MoviesAdminPage` + `movieApi.ts` + `requireRole("admin")`) is the pattern to copy. Auth remains the Phase 1/2 stub. No Prisma schema change.

## Goals / Non-Goals

**Goals:**

- One write path: HTTP admin → `ProfileService` → Prisma. Tools keep calling `getByUserId` only.
- List is a user census (`findMany` users include profile), not a profile-only table dump.
- Shared Zod owns create/patch/list item shapes so web and api do not diverge.

**Non-Goals:**

- New tables, JWT, BehaviorLog on profile writes, chat UI for self-edit, user registration.

## Decisions

1. **Mount `/api/profiles` like movies**  
   Why: architecture already names `profiles.ts`; unused singular contract has no callers.  
   Alternative: keep `/api/profile/:userId` and add a second list path — two styles for one resource.

2. **Route order: `GET /` then `GET /:userId`; UUID param schema**  
   Why: Express would otherwise treat `"search"`-style segments as ids; invalid ids must be `INVALID_USER_ID` not a generic 404.  
   Alternative: query `?userId=` for item get — rejected, REST item path is clearer.

3. **Create = `profile.create` after `user.findUnique`; conflict = 409**  
   Why: unique `userId` PK; catching Prisma P2002 plus an existence check gives a stable `PROFILE_ALREADY_EXISTS`. Missing user is `USER_NOT_FOUND` before create.  
   Alternative: upsert — would silently overwrite, violating “create only if none”.

4. **Patch = single `update` (atomic); omit undefined keys**  
   Why: constitution wants atomic profile updates; partial body matches movies PATCH.  
   Alternative: replace-all PUT — more payload, worse UX for one field.

5. **Admin UI copies movies fetch helper (`X-Dev-Role: admin`)**  
   Why: no JWT yet; same local demo as `/admin/movies`.  
   Alternative: role switcher in header — extra UX, not in approved requirements.

6. **Comma-split arrays on the client, string arrays on the wire**  
   Why: movies already do this for `genres`; no new enum/migration.  
   Alternative: chip multi-select from distinct movie genres — extra catalog coupling.

7. **No recommend code change unless tests need a fixture**  
   Why: no cache; next `getByUserId` sees new likes. Tests can patch then call `recommendMovieTool` with mocked movies or existing ranking helper.

## Risks / Trade-offs

- [Typo in `likeGenres` silently drops weighting] → document exact overlap; do not invent fuzzy match this change.
- [List leaks all emails to anyone who can send admin stub header] → same as movies write; FU-5 JWT is the real control.
- [PATCH empty `name` ] → Zod `min(1)` → `VALIDATION_ERROR`.
- [Admin creates profile for `dev-admin` then chat still uses `dev-user`] → expected; chat speaker is unchanged.

## Migration Plan

- No database migration. Deploy API (mount routes) and web (new page) together.
- Rollback: unmount router and remove nav; leftover profile rows for `dev-admin` are harmless.
- Docs: replace `API_CONTRACT.md` §3.8 with plural resource; add list/create/patch; add error codes; drop singular from current endpoints; remove PATCH from “future” list.

## Open Questions

None that affect specs or task breakdown.

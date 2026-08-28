## Context

See `proposal.md` for motivation. Phase 1 already has Movie CRUD, shared mood/scene enums, and `authMiddleware` stub IDs. Agent tool files and `POST /api/chat` are empty placeholders; Prisma has no Profile/Rental/BehaviorLog. Spine docs disagree on borrow entry (`ARCHITECTURE.md` chat+tools vs `API_CONTRACT.md` REST `/borrow`).

Constraints: unified `{ code, data, msg }` for non-SSE errors; inventory in a DB transaction; no LLM calls this change; tests must not hit real OpenAI/Claude; `packages/database/.env` and `apps/api/.env` `DATABASE_URL` must stay in sync for local verify.

## Goals / Non-Goals

**Goals:**

- Keep `IntentClassifier` → `Planner` → `ToolDispatcher` → `ResponseSynthesizer` as replaceable boundaries (rules now, LLM later) without changing SSE event names.
- One write path for stock: rental service used only from the borrow tool.
- Seed user primary key equals stub `DEV_USER_ID`.

**Non-Goals:**

- Session table, JWT, REST `/borrow`, return flow, profile CRUD, log UI (FU-1–FU-7).
- Calling `@fairy/ai-sdk` `chat`/`stream`.

## Decisions

1. **Rule classifier, not LLM**  
   Why: approved requirement; CI cannot call vendors.  
   Alternative: dual path with API key — rejected as two behaviors to test.

2. **SSE events `text` | `recommendation` | `borrow` | `done`**  
   Why: cards and stock updates are structured; templates stay in `text`.  
   Alternative: JSON once — rejected (architecture + analysis require SSE).

3. **Borrow via chat `movieId`, not REST**  
   Why: single mutation path.  
   Alternative: implement `POST /api/borrow` in parallel — rejected (dual write).

4. **Prisma enums `RentalStatus` `ACTIVE`/`RETURNED` now, no return handler**  
   Why: unique (userId, movieId) where ACTIVE supports `ALREADY_BORROWED`; FU-4 fills return.  
   Alternative: boolean `returned` — weaker uniqueness.

5. **Conditional `UPDATE ... WHERE stock > 0` inside `$transaction` with rental insert**  
   Why: constitution data-consistency; prevents oversell.  
   Alternative: read-modify-write without condition — race.

6. **Title fuzzy match in classifier before tool**  
   Why: tool always receives a single `movieId` or the planner never calls borrow.  
   Alternative: tool searches by string — mixes resolution with mutation.

7. **No Session persistence; ignore `sessionId` for storage**  
   Why: single-turn tools suffice; FU-7 later.

## Risks / Trade-offs

- [Repeated demo empties stock] → seed reset or admin stock edit (no return).
- [Rule matching is brittle for titles] → unique containment; 0 or 2+ matches do not mutate.
- [Default stub role is `user` when headers missing] → keep Phase 1 behavior; chat still binds `DEV_USER_ID`.
- [SSE harder to test than JSON] → supertest parse `text/event-stream`; web mocks fetch.

## Migration Plan

- Add Prisma migration `add_profile_rental_behavior_log`; run generate; seed users+profile.
- Deploy API+web together (chat route + UI).
- Rollback: revert migration after dropping new rows; remove `/api/chat` mount. No production traffic yet.

## Open Questions

None that affect specs or task breakdown.

# Fairy — Agent Instructions

This file defines the rules for AI agents working on the **Fairy** project.
Fairy is an all-in-one AI Agent assistant and video-rental store management system.

- Frontend: React + TypeScript
- Backend: Node.js + Express
- Database: PostgreSQL
- AI providers: OpenAI and Claude APIs

If these instructions conflict with explicit human instructions, follow the human instructions first.

---

## 0. Project Constitution (Non-Negotiable)

- **Tool-Use Authority**: The Agent MUST operate business systems (movie search, borrow, travel planning) exclusively through tool calls. Fabricating data in conversation or bypassing tools to emit results directly is prohibited.
- **Unified Response Format**: All API responses MUST follow the `{ code, data, msg }` shape. No other structure is allowed.
- **Secret Isolation**: All sensitive information (API keys, database passwords, JWT secrets, etc.) MUST be injected via environment variables. Hard-coding secrets in any form is prohibited.
- **Status Document Synchronization**: `PROJECT_STATUS.md` MUST be updated after every completed feature so project state tracks code progress.
- **OpenSpec Process**: New feature development MUST follow the OpenSpec workflow (Propose → Apply → Archive). Implementation cannot begin until the proposal is reviewed.
- **Data Consistency First**: Core business state changes involving inventory, rentals, or profiles MUST be executed inside database transactions to ensure atomicity and eventual consistency.
- **User Experience Safeguard**: All AI-generated content MUST pass credibility validation or graceful degradation before reaching the user. Raw error stacks or model hallucinations MUST NOT be exposed to users.

---

## 1. Project Structure

Know the layout before editing any file.

```
Fairy/
├── apps/
│   ├── web/                 # React + TypeScript frontend
│   └── api/                 # Node.js + Express backend
├── packages/
│   ├── shared/              # Shared types, schemas, and utilities
│   ├── ai-sdk/              # OpenAI / Claude client wrappers
│   └── database/            # Prisma schema, migrations, seeders
├── docs/                    # Architecture and API documentation
└── scripts/                 # Local development and deployment scripts
```

Key entry points:

- Web app: `apps/web/src/main.tsx`
- API server: `apps/api/src/index.ts`
- Database schema: `packages/database/prisma/schema.prisma`
- Shared types: `packages/shared/src/index.ts`

---

## 2. Core Modules

Understand the domain boundaries before changing code.

| Module | Responsibility | Primary Paths |
|---|---|---|
| Fairy Agent | Conversational AI assistant, tool use, memory | `apps/api/src/agent/`, `packages/ai-sdk/` |
| Video Store | Movie catalog, recommendations, rentals | `apps/api/src/store/`, `apps/web/src/store/` |
| Agent Profile | User/persona portraits and preference memory | `apps/api/src/profile/`, `packages/database/` |
| Memory Center | Long-term context, session history, embeddings | `apps/api/src/memory/`, `packages/database/` |

---

## 3. Working Style

- Make focused, reviewable changes. One concern per branch or commit.
- Read nearby code and existing tests before introducing new patterns.
- Prefer existing APIs, components, and conventions over new abstractions.
- Reuse shared types from `packages/shared/`; do not duplicate schemas between frontend and backend.
- Avoid unrelated refactors when fixing a bug or adding a feature.
- Ask for clarification when requirements are ambiguous or conflict with existing rules.

---

## 4. Code Conventions

### TypeScript

- Use strict TypeScript everywhere. `strict: true` must remain enabled.
- Avoid `any` and `unknown`. Use explicit types or `never` for impossible states.
- Prefer `interface` for public shapes; use `type` for unions, intersections, and mapped types.
- Do not export symbols unless consumed by another package or module.
- Do not add values to the global namespace.

### Naming

- React components: PascalCase.
- Hooks: camelCase prefixed with `use`.
- API routes and utility functions: camelCase.
- Database models and Prisma tables: PascalCase.
- Environment variables: UPPER_SNAKE_CASE.
- Prefer whole words over abbreviations, except widely known acronyms (HTTP, URL, AI).

### Frontend

- Use functional components and hooks. Class components are prohibited.
- Co-locate styles using the project's chosen CSS solution; do not inline styles for layout.
- Keep components small. Extract when a component exceeds ~150 lines.
- Handle loading, error, and empty states explicitly in UI components.
- Localize all user-facing strings. Source of truth: `apps/web/src/locales/`.

### Backend

- Structure routes under `apps/api/src/routes/`; one file per domain resource.
- Use controller functions in `apps/api/src/controllers/`; keep route handlers thin.
- Validate all request bodies with Zod schemas from `packages/shared/`.
- Return consistent error shapes. `{ error: string, code?: string }` is the default.
- Use `async/await`. Do not use callback-style code or bare Promise chains.

### Database

- Treat Prisma as the single source of truth for schema and migrations.
- Every schema change must result in a generated migration.
- Name migrations descriptively: `add_memory_embeddings`, `create_rental_table`.
- Use transactions for operations that modify multiple related rows.
- Index columns used in filters, joins, and ordering. Document compound indexes in comments.

---

## 5. AI Integration Rules

- Abstract provider-specific logic inside `packages/ai-sdk/`. Other code consumes a unified interface.
- Support both OpenAI and Claude. Do not hardcode provider-specific models or parameters outside the SDK package.
- Store API keys in environment variables only. Never commit keys or placeholder credentials.
- Sanitize user input before sending it to AI providers.
- Log AI provider errors without exposing response payloads that may contain sensitive data.
- Implement token usage tracking in `apps/api/src/agent/usage.ts`.
- Cache embeddings and frequently used context when it is safe to do so; document cache invalidation rules.

---

## 6. Memory and Profile Rules

- Store agent memory as structured records in PostgreSQL; use vector extensions only for embedding search.
- Associate every memory record with a `profileId` and optional `sessionId`.
- Respect privacy boundaries: do not persist sensitive user data without explicit consent flags in the profile.
- Use the Memory Center for retrieval, ranking, and context window management. Do not inline memory queries in agent controllers.
- Profile updates must be atomic and idempotent.

---

## 7. Testing Rules

- Add or update tests for every bug fix and feature.
- Frontend: place tests next to source files as `*.test.tsx`.
- Backend: place tests in `apps/api/src/__tests__/` mirroring the source structure.
- Database: use a separate test database or Prisma transaction rollback between tests.
- Mock external AI providers in unit tests. Do not call real OpenAI or Claude APIs in CI.
- Prefer deterministic assertions. Avoid asserting on exact log messages or timestamps unless necessary.

### Validation Commands

Run the narrowest relevant command for the area changed:

```bash
# Type checking
pnpm --filter=@fairy/web typecheck
pnpm --filter=@fairy/api typecheck

# Linting and formatting
pnpm lint
pnpm format:check

# Tests
pnpm --filter=@fairy/web test
pnpm --filter=@fairy/api test

# Database
pnpm --filter=@fairy/database migrate:status
pnpm --filter=@fairy/database generate
```

Run full validation only when the change is broad or crosses packages:

```bash
pnpm ci
```

---

## 8. OpenSpec Workflow Integration

OpenSpec is the project's change-management workflow. The installed plugin exposes three commands: `/opsx:propose`, `/opsx:apply`, and `/opsx:archive`.

### Mandatory Rule

All new feature development MUST go through the OpenSpec workflow. Skipping the proposal phase and writing implementation code first is prohibited. If a feature is discovered mid-implementation, stop and create a retroactive proposal before continuing.

### Phase 1: Propose

**Command:** `/opsx:propose`

- Trigger: A new feature, module, API, or non-trivial refactoring is requested or planned.
- Output:
  - A proposal file under `docs/openspec/proposals/` named `YYYY-MM-DD-<feature-slug>.md`.
  - Sections required: goal, scope, non-goals, affected modules, API surface, data changes, risks, and success criteria.
- Approval: The proposal MUST be acknowledged or approved by the human lead before `/opsx:apply` is executed.

### Phase 2: Apply

**Command:** `/opsx:apply`

- Trigger: The proposal is approved and implementation begins.
- Output:
  - Implementation code, tests, and migrations.
  - Updates to `API_CONTRACT.md`, `ARCHITECTURE.md`, or `docs/` when public interfaces or system design change.
- Rule: Do not expand scope during apply. New requirements discovered here require a follow-up `/opsx:propose`.

### Phase 3: Archive

**Command:** `/opsx:archive`

- Trigger: The feature is implemented, tested, reviewed, and merged or accepted.
- Output:
  - The proposal file is moved to `docs/openspec/archive/` with the same basename.
  - A completion note is appended summarizing what was built and any deviations from the original proposal.

### Linkage with PROJECT_STATUS.md

After EVERY `/opsx:archive`, the AI MUST update `PROJECT_STATUS.md`:

- Add the archived feature to the **Completed Modules** section.
- Move it out of **In Progress** if it was listed there.
- Update **Next Steps** if the completed feature unblocks downstream work.
- Update **Last Updated** to the current date.

### Exceptions

Emergency bug fixes may simplify the workflow:

- A proposal can be created concurrently with or immediately after the fix.
- The fix MUST still be archived via `/opsx:archive` once merged.
- `PROJECT_STATUS.md` MUST still be updated after archiving.

---

## 9. Security and Secrets

- Never commit `.env` files, API keys, database passwords, or JWT secrets.
- Use `process.env` for secrets. Validate required env vars at startup.
- Hash passwords with bcrypt or Argon2. Never store plain text credentials.
- Sanitize SQL inputs through Prisma; raw queries require mandatory parameterization.
- Validate all file uploads for type and size. Store user uploads outside the web root.
- Set secure HTTP headers via Helmet in production.
- Do not expose stack traces or internal paths in production error responses.

---

## 10. Git and Commit Rules

- Keep commits atomic and descriptive. Use present-tense imperative mood.
- Commit message format: `<scope>: <short description>`.
  Examples:
  - `agent: add tool selection for rental queries`
  - `store: fix recommendation pagination`
  - `db: add profile preference columns`
- Do not commit generated artifacts, lockfile conflicts, or failing tests.
- Do not add AI-generated co-author footers unless explicitly requested.

---

## 11. Prohibited Patterns

- No `any` types except in temporary migration scripts with explicit comments.
- No duplicated validation logic between frontend and backend. Use `packages/shared/`.
- No direct AI provider client imports outside `packages/ai-sdk/`.
- No raw SQL without parameterized queries.
- No synchronous file system or network calls in request handlers.
- No secrets in logs, error messages, or test snapshots.
- No blocking the main thread with heavy computation; offload to workers or background jobs.
- No feature toggles without corresponding documentation in `docs/features/`.

---

## 12. Documentation

- Update `docs/` when changing architecture, environment requirements, or public APIs.
- Document new environment variables in `apps/api/.env.example` and `apps/web/.env.example`.
- Keep API documentation in sync with route changes.
- Prefer README files next to modules for local context.

---

## 13. Documentation Governance

Fairy uses a docs-governance spine. The four core documents below are the single source of truth for their respective domains. Code must follow them; when they drift, the documents take precedence and the discrepancy must be surfaced to the human lead.

### 13.1 Core Documents

| Document | Responsibility | Single Source of Truth For |
|---|---|---|
| `AGENTS.md` | AI behavior constitution and project-wide rules. | How AI agents must work on this project; non-negotiable constraints. |
| `ARCHITECTURE.md` | System architecture, module boundaries, and data flows. | Where code belongs, how components interact, and how data moves. |
| `API_CONTRACT.md` | All HTTP API definitions and payload shapes. | Frontend-backend integration; request/response formats. |
| `PROJECT_STATUS.md` | Project phase, completed work, in-progress items, risks, and decisions. | Current project state and next priority. |

### 13.2 Update Rules

| Code Change | Documents to Update |
|---|---|
| New AI/agent behavior or workflow | `AGENTS.md`, `ARCHITECTURE.md` |
| New/changed module, service, or data flow | `ARCHITECTURE.md` |
| New/changed API endpoint or payload | `API_CONTRACT.md` |
| Feature completion, phase change, or risk discovered | `PROJECT_STATUS.md` |
| New environment variable or secret | `AGENTS.md` (security rules), `.env.example`, relevant docs |

- A pull request or code change is incomplete until every affected spine document is updated.
- Do not mark a task complete in `PROJECT_STATUS.md` until the related code and documents are merged.

### 13.3 AI Behavior Constraint

- Before modifying code, the AI MUST consult the relevant spine document(s).
- If the code and a spine document disagree, the document wins. The AI must:
  1. Follow the document.
  2. Call out the inconsistency to the human lead.
  3. Not silently overwrite the document to match the code without explicit approval.
- If a required document is missing or ambiguous, pause and ask for clarification before proceeding.

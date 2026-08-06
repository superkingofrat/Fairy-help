# Fairy — Architecture Specification

**Version:** 1.0  
**Scope:** Frontend, backend, data layer, and AI/agent orchestration for Fairy AI Agent + video store management platform.

---

## 1. Design Philosophy

Fairy is an LLM-driven agent that operates real business systems through a closed loop of **intent understanding → profile-aware planning → tool invocation → observation → response generation**. The architecture is optimized for:

- Streaming, characterful conversation as the primary interface.
- Safe, observable tool execution against real data (inventory, profiles, history).
- Strong personalization via a unified profile and memory center.
- Verifiable AI output (e.g., travel destinations validated by a real map API).

The design synthesizes three proven patterns:

| Reference Architecture | Core Idea Borrowed |
|---|---|
| **LangGraph** | Stateful agent loop modeled as explicit states/transitions: classify → plan → call tool → observe → reply. |
| **Letta (MemGPT)** | A central memory service with bounded working context and persistent long-term records. |
| **Vercel AI SDK / Anthropic workflows** | Declarative tool schemas, streaming text generation, and workflow-style tool orchestration. |

---

## 2. Logical Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                            │
│  React + TypeScript  •  SSE stream consumer  •  CSS avatar  •  Map   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ SSE / REST
┌──────────────────────────────────▼──────────────────────────────────┐
│                         API Gateway Layer                            │
│  Express  •  Auth middleware  •  Request validation (Zod)  •  Router  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                       Agent Orchestration Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Intent     │  │   Planner    │  │     Tool Dispatcher      │  │
│  │  Classifier  │  │              │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         │                 │                       │                 │
│         └─────────────────┼───────────────────────┘                 │
│                           ▼                                         │
│                  ┌─────────────────┐                                │
│                  │   State Loop    │                                │
│                  │  observe → reply │                                │
│                  └─────────────────┘                                │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                          Tool Layer                                  │
│  Movie Recommendation  •  Rental Tool  •  Travel Planner  •  Insight │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                       Service / Data Layer                           │
│  Profile Service  •  Movie Service  •  Rental Service  •  Map Client │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                       Persistence Layer                              │
│  PostgreSQL  •  Prisma ORM  •  migrations  •  seeders                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Layer Responsibilities

### 3.1 Presentation Layer (`apps/web/`)

| Component | Responsibility |
|---|---|
| `ChatPage` | Conversation container, SSE connection lifecycle, message list. |
| `FairyAvatar` | CSS-animated character avatar with expression states. |
| `MessageStream` | Renders incremental tokens as they arrive over SSE. |
| `RecommendationCard` | Displays movie recommendation with one-click borrow action. |
| `TripTimeline` | Displays generated itinerary with map route overlay. |
| `AdminDashboard` | Rental statistics and operational insights. |

Rules:

- The frontend never holds business transaction logic. It sends intent text and renders results.
- Map rendering uses the client-side **Amap JS API only**. Server-side Amap keys remain secret.
- All user-facing strings are sourced from the localization module.

### 3.2 API Gateway Layer (`apps/api/src/routes/`, `apps/api/src/middleware/`)

| Component | Responsibility |
|---|---|
| `POST /api/chat` | Entry point for all conversational requests. Accepts text + session context. |
| `authMiddleware` | Validates JWT/session; attaches `userId` and `role`. |
| `validateBody` | Validates request shape using Zod schemas from `packages/shared/`. |
| Domain routers (`/movies`, `/rentals`, `/trips`, `/profiles`) | REST endpoints for admin CRUD and direct UI operations. |

Rules:

- All chat traffic flows through `/api/chat`. No direct tool invocation from the client.
- Domain routers are for admin/maintenance UIs, not for agent logic.

### 3.3 Agent Orchestration Layer (`apps/api/src/agent/`)

This is the heart of Fairy. It is modeled as an explicit state loop rather than a single prompt.

| Component | Responsibility |
|---|---|
| `IntentClassifier` | Maps user input to one of: `chat`, `recommend_movie`, `borrow_movie`, `plan_trip`, `store_insight`. |
| `ContextBuilder` | Loads working memory: recent messages, user profile, and recent behavior logs. |
| `Planner` | Decides which tool(s) to call and in what order. |
| `ToolDispatcher` | Executes the selected tool, catches errors, and returns observations. |
| `ResponseSynthesizer` | Converts observations into final streamed reply in Fairy persona. |
| `StateLoop` | Drives the classify → plan → tool → observe → reply cycle, up to a max iteration limit. |

Rules:

- The loop terminates after a final response or after reaching `MAX_AGENT_ITERATIONS`.
- Errors from a tool are returned to the LLM as observations so Fairy can recover or apologize.
- No LLM output is persisted without first validating time-sensitive facts (inventory, map POI).

### 3.4 Tool Layer (`apps/api/src/tools/`)

Each tool is a self-contained function with a strict JSON schema consumed by the LLM.

| Tool | Responsibility |
|---|---|
| `recommendMovieTool` | Reads profile + mood/scene filters, returns ranked movie cards. |
| `borrowMovieTool` | Checks stock, decrements inventory, writes rental log. |
| `planTripTool` | Reads profile, asks LLM for draft itinerary, validates POIs with Amap, computes routes. |
| `storeInsightTool` | Aggregates rental/operation metrics and asks LLM for business suggestions. |

Rules:

- Every tool logs its invocation and outcome to the behavior log.
- Every tool returns a deterministic shape: `{ success, data, error }`.
- Tools are the **only** place business mutations happen during agent flow.

### 3.5 Service / Data Layer (`apps/api/src/services/`, `packages/database/`)

| Service | Responsibility |
|---|---|
| `ProfileService` | CRUD for persona, preferences, dislikes, and travel style. |
| `MovieService` | Catalog and metadata; enforces `mood` and `scene` tags. |
| `RentalService` | Inventory checks, borrow transactions, return handling. |
| `BehaviorLogService` | Append-only activity log for agent memory. |
| `AmapClient` | Server-side POI search and route planning wrapper. |
| `AiProviderClient` | Unified OpenAI/Claude client from `packages/ai-sdk/`. |

Rules:

- Services do not depend on Express or HTTP context.
- Database access goes through Prisma models only.

### 3.6 Persistence Layer (`packages/database/`)

| Entity | Purpose |
|---|---|
| `User` | Authentication, role (`admin`, `user`, `agent`). |
| `Profile` | Personality tags, movie preferences, travel style, diet, dislikes. |
| `Movie` | Catalog with required `mood[]` and `scene[]` arrays, plus quote snippets. |
| `Rental` | Borrow/return records linked to user and movie. |
| `Trip` | Generated itinerary with validated POIs and routes. |
| `BehaviorLog` | Append-only ledger: who, when, action, related entity. |
| `Session` | Lightweight conversation context for short-term memory. |

Rules:

- `mood` and `scene` use strict enums. No free-form strings.
- Every business action writes one `BehaviorLog` row minimum.
- Long-term memory is derived from `Profile` + `BehaviorLog`, not from prompt stuffing.

---

## 4. Tool Scheduling Design

### 4.1 Scheduling Model

Fairy uses **single-agent sequential scheduling with deterministic routing** (inspired by LangGraph state transitions and Vercel AI SDK `streamText` with tools):

1. **Classify** — IntentClassifier selects the target domain.
2. **Plan** — Planner picks the tool sequence. Most flows use one tool; travel planning may use `planTripTool` which internally calls the map API.
3. **Execute** — ToolDispatcher runs the tool inside a transaction where needed.
4. **Observe** — Tool result is appended to the running state.
5. **Synthesize** — ResponseSynthesizer streams the final reply.

### 4.2 Tool Definition Schema

Each tool exposes a schema compatible with OpenAI/Claude function calling:

```ts
interface Tool {
  name: string;
  description: string;           // Written from the model's perspective
  parameters: z.ZodObject<any>;  // Shared Zod schema
  handler: (args: any, ctx: AgentContext) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### 4.3 Tool Dispatch Flow

```
User message
    │
    ▼
IntentClassifier ──► Intent: recommend_movie
    │
    ▼
ContextBuilder loads profile + recent logs
    │
    ▼
Planner selects recommendMovieTool
    │
    ▼
ToolDispatcher ──► recommendMovieTool
    │
    ▼
MovieService + ProfileService
    │
    ▼
ToolResult (movies ranked)
    │
    ▼
ResponseSynthesizer streams final reply
```

### 4.4 Error Handling

- Tool failure returns `{ success: false, error }` to the orchestrator.
- The orchestrator may retry once for transient external errors (e.g., map API timeout).
- Fatal errors are streamed to the user as a friendly message; details are logged server-side.

---

## 5. Data Flow

### 5.1 Movie Recommendation Flow

```
[Frontend] "心情不好"
    │
    ▼ SSE
[POST /api/chat]
    │
    ▼
[Agent Orchestrator]
    │
    ├── IntentClassifier ──► recommend_movie
    ├── ContextBuilder   ──► load profile, recent logs
    ├── Planner          ──► recommendMovieTool(mood: 致郁/治愈, profile)
    │
    ▼
[recommendMovieTool]
    │
    ├── ProfileService ──► movie genre preference
    ├── MovieService   ──► SELECT WHERE mood @> {致郁, 治愈} AND stock > 0
    └── BehaviorLogService ──► log recommendation event
    │
    ▼
[ToolResult] movie cards
    │
    ▼
[ResponseSynthesizer] stream recommendation reply + cards
    │
    ▼ SSE
[Frontend] render MessageStream + RecommendationCard
```

### 5.2 Borrow Execution Flow

```
[Frontend] click "一键借阅" on recommendation card
    │
    ▼ SSE (message: "我要借《XXX》")
[POST /api/chat]
    │
    ▼
[Agent Orchestrator]
    │
    ├── IntentClassifier ──► borrow_movie
    ├── Planner          ──► borrowMovieTool(movieId, userId)
    │
    ▼
[borrowMovieTool]
    │
    ├── RentalService ──► BEGIN TX
    │   ├── check stock > 0
    │   ├── decrement stock
    │   ├── insert Rental row
    │   └── commit
    ├── MovieService   ──► return updated stock
    └── BehaviorLogService ──► log borrow event
    │
    ▼
[ToolResult] { success, rental, remainingStock }
    │
    ▼
[ResponseSynthesizer] stream confirmation + updated card
```

### 5.3 Travel Planning Flow

```
[Frontend] "想去玩"  or  admin: "想和 XXX 去玩"
    │
    ▼ SSE
[POST /api/chat]
    │
    ▼
[Agent Orchestrator]
    │
    ├── IntentClassifier ──► plan_trip
    ├── ContextBuilder   ──► load target profile(s)
    ├── Planner          ──► planTripTool(city, profile)
    │
    ▼
[planTripTool]
    │
    ├── AiProviderClient ──► LLM generates candidate POIs
    ├── AmapClient       ──► validate each POI exists
    │   └── if invalid ──► ask LLM to regenerate or return error
    ├── AmapClient       ──► route planning between valid POIs
    └── BehaviorLogService ──► log trip planning event
    │
    ▼
[ToolResult] validated itinerary + route
    │
    ▼
[ResponseSynthesizer] stream itinerary + map data
    │
    ▼ SSE
[Frontend] render TripTimeline + Amap JS route overlay
```

### 5.4 Memory / Profile Flow

```
Every tool execution
    │
    ▼
[BehaviorLogService] append row
    │
    ▼
Future ContextBuilder reads
    ├── latest N Session messages (short-term)
    ├── recent BehaviorLog rows (medium-term)
    └── Profile entity (long-term)
    │
    ▼
[Prompt context window] bounded by token budget
```

---

## 6. State Management

### 6.1 Agent State Object

The orchestrator maintains one state object per request:

```ts
interface AgentState {
  sessionId: string;
  userId: string;
  role: 'admin' | 'user' | 'agent';
  messages: ChatMessage[];        // Working conversation context
  intent: Intent | null;
  plan: ToolCall[] | null;
  observations: ToolResult[];
  iteration: number;
  maxIterations: number;
}
```

### 6.2 Persistence Strategy

| State Type | Storage | TTL / Scope |
|---|---|---|
| Working conversation context | In-memory per SSE request + `Session` table | Last 10–20 messages |
| User profile | PostgreSQL `Profile` table | Persistent |
| Activity history | PostgreSQL `BehaviorLog` table | Persistent |
| Tool result cache | Optional Redis/memory for map POIs | Short TTL (minutes) |

---

## 7. External Integrations

| Service | Usage | Safety Rule |
|---|---|---|
| **OpenAI API** | LLM inference for intent, planning, synthesis. | Key via env; no logging of prompts/keys. |
| **Claude API** | Alternative LLM provider. | Same as OpenAI. |
| **Amap Server API** | POI validation and route planning. | Server-side only; key never exposed to frontend. |
| **Amap JS API** | Map rendering in browser. | Frontend key restricted to referrers. |

---

## 8. Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Single chat endpoint `/api/chat` | Centralizes agent governance, auth, and logging. |
| Explicit state loop instead of a single prompt | Easier to debug, test, and constrain tool execution. |
| Profile-first design | All personalization flows read `Profile` before acting; avoids duplicating preference logic. |
| Append-only behavior log | Provides observable history for agent memory and business analytics. |
| Server validates AI-generated places | Prevents hallucinated destinations from reaching the user. |
| SSE over WebSocket for chat | Simpler typing effect and aligns with Vercel AI SDK streaming patterns. |

---

## 9. Module-to-Directory Mapping

```
apps/web/src/
  components/
    chat/              # ChatPage, MessageStream, RecommendationCard, TripTimeline
    fairy/             # FairyAvatar, expressions
    admin/             # AdminDashboard
  hooks/
    useSSE.ts          # SSE stream consumer
  stores/
    chatStore.ts

apps/api/src/
  routes/
    chat.ts            # POST /api/chat
    movies.ts
    rentals.ts
    trips.ts
    profiles.ts
  agent/
    stateLoop.ts
    intentClassifier.ts
    contextBuilder.ts
    planner.ts
    toolDispatcher.ts
    responseSynthesizer.ts
  tools/
    recommendMovieTool.ts
    borrowMovieTool.ts
    planTripTool.ts
    storeInsightTool.ts
  services/
    movieService.ts
    rentalService.ts
    profileService.ts
    behaviorLogService.ts
    amapClient.ts
  middleware/
    auth.ts
    validateBody.ts

packages/shared/
  schemas/             # Zod schemas used by frontend and backend
  types/               # Shared TypeScript types

packages/ai-sdk/
  providers/           # OpenAI/Claude client wrappers
  streaming.ts         # Unified stream helpers

docs/
  architecture.md      # This file
  tools.md             # Tool registry and schemas
  prompts.md           # System prompts and prompt templates
```

---

## 10. Validation & Evolution

- Run `pnpm --filter=@fairy/api test` after any change in `agent/` or `tools/`.
- Add unit tests for every new tool and state transition.
- Keep this document updated when adding new intents, tools, or external integrations.

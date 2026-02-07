---
title: "Tend Web v0.1.0 — Core Web App MVP"
type: feat
date: 2026-02-06
version: 0.1.0
milestone: M1
status: draft
deepened: 2026-02-06
simplified: 2026-02-06
---

# Tend Web v0.1.0 — Core Web App MVP

## Overview

Rebuild Tend as a web-first application, replacing the Tauri/Rust/SQLite desktop prototype with a Next.js + FastAPI + PostgreSQL stack. This is a greenfield build informed by the prototype — not a port. The prototype serves as a reference implementation for business logic, but every line of code is written fresh for the new stack.

v0.1.0 delivers the M1 milestone from the PRD: email/password auth, task CRUD with buckets and domains, morning/evening triage, honest nudge, auto-archive reaper, onboarding, dark theme, and deployment.

## Problem Statement / Motivation

The Tauri prototype validated Tend's core concepts (forced triage, honest nudge, reaper, domain bucketing) but is limited by its desktop-only, single-user architecture. The web rebuild enables:

- Multi-device access (phone-first morning triage)
- User accounts and future paid sync tier
- Agent-native architecture (API-first design for future MCP integration)
- Faster iteration (Python/React vs Rust/vanilla TS)

## What Transfers from the Prototype

The Tauri prototype at `src-tauri/` and `src/` is a **reference implementation**, not a codebase to port. Here's what transfers and what doesn't:

### Logic that transfers (reimplement in Python)

| Pattern | Prototype Location | Web Location |
|---------|-------------------|--------------|
| Task CRUD with sub-task 1-level enforcement | `src-tauri/src/commands.rs:18-72` | `backend/app/services/task_service.py` |
| Sub-task bucket/domain inheritance from parent | `commands.rs:30-45` | `task_service.py` |
| Complete task → cascade to children + stats | `commands.rs:207-252` | `task_service.py` |
| Defer task → bucket change + increment reschedule_count + cascade children | `commands.rs:172-205` | `services/triage_service.py` |
| Domain max-5 enforcement | `commands.rs:268-290` | `services/domain_service.py` |
| Domain delete → SET NULL on tasks | DB-level `ON DELETE SET NULL` | Alembic migration + SQLModel |
| Reaper two-pass archive (parents, then orphaned children) | `src-tauri/src/reaper.rs` | `services/reaper_service.py` |
| Daily stats upsert on task create/complete | `commands.rs:60-72, 240-252` | `services/stats_service.py` |

### Resolved discrepancies (PRD takes precedence)

| Area | Prototype | PRD (what we build) |
|------|-----------|---------------------|
| Triage scope | Only `bucket = 'today'` tasks | All pending top-level tasks |
| Reaper staleness field | `updated_at` | `created_at` (a task updated yesterday but created 45 days ago should still be reaped) |
| Honest nudge threshold | Only when `pending.length > 8` | Always show after first triage |
| Age badge rules | Simple 3-tier (8d/22d) | Bucket-relative thresholds (PRD Section 10.1) |
| Domain position | Not implemented | `position` field for ordering |
| Task text limit | Unlimited | 500 characters max |

### Entirely new for web

- User model + auth (NextAuth.js → FastAPI)
- Multi-tenant user scoping on all queries
- Onboarding 3-step flow + progressive education
- Wind-down triage endpoint
- API response context (completion average, triage progress)
- Structured machine-readable errors

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                      Client                         │
│              (Browser / PWA shell)                   │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────┐
│            Next.js on Vercel (iad1 region)           │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │ App Router   │  │ Auth       │  │ API Proxy    │ │
│  │ (SSR/RSC)   │  │ (NextAuth) │  │ /api/* → BE  │ │
│  └─────────────┘  └────────────┘  └──────┬───────┘ │
└──────────────────────────────────────────┼──────────┘
                                           │ HTTPS + Bearer Token (signed JWT, 60s TTL)
┌──────────────────────────────────────────▼──────────┐
│         FastAPI on Railway (us-east4 region)         │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ API      │  │ Services  │  │ Reaper (ext cron) │ │
│  │ Routes   │  │ (logic)   │  │ (daily archive)   │ │
│  └────┬─────┘  └─────┬─────┘  └────────┬─────────┘ │
│       └───────────────┼─────────────────┘           │
└───────────────────────┼─────────────────────────────┘
                        │ SQLModel (sync)
┌───────────────────────▼─────────────────────────────┐
│           PostgreSQL (Railway Managed)               │
│         tasks | domains | daily_stats | users        │
└─────────────────────────────────────────────────────┘
```

### Key Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Sync vs Async Python | **Sync** | DB-bound CRUD app; sync + connection pooling outperforms async for this workload |
| ORM | **SQLModel** | Pydantic + SQLAlchemy in one; natural FastAPI integration |
| Auth | **NextAuth.js v5** — email/password only for v0.1.0 | Handles session management; Google OAuth deferred to fast-follow within M1 |
| Enums | **StrEnum as TEXT** | Store as TEXT + CHECK constraints in DB (not native ENUM — avoids ALTER TYPE migration pain) |
| Cascade deletes | **`cascade_delete=True`** (SQLModel-native) | User→Tasks, User→Domains, Task→Children: `cascade_delete=True` + `ondelete="CASCADE"`. Domain→Tasks: `ondelete="SET NULL"` + `passive_deletes=True` |
| Testing | **Shared DB with rollback** | Fast, simple, sufficient for todo app |
| Frontend state | **Server Components + fetch** | No client-side state management library needed for v0.1.0 |
| Region co-location | **Vercel iad1 + Railway us-east4** | Same-region deployment saves 40-100ms per proxied request |
| Proxy JWT | **Two separate secrets** | `NEXTAUTH_SECRET` for sessions, `INTERNAL_JWT_SECRET` for proxy JWT — isolation prevents cross-compromise |

### Research Insights: Architecture

**Transaction Boundary Convention:**
Services NEVER call `db.commit()`. The `get_db()` dependency owns the transaction lifecycle:
```python
def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
```
This ensures composability — a route handler can call multiple services in one transaction.

**Phase 3 Circular Dependency:**
NextAuth needs to call `POST /users` to create users on first login, but FastAPI needs JWT validation from NextAuth. Break the cycle: implement `POST /users` first with a temporary auth bypass, then wire up full JWT validation after NextAuth is configured.

### Implementation Phases

---

#### Phase 1: Project Scaffolding & Data Layer

**Goal:** Monorepo initialized, PostgreSQL connected, all tables created, first migration runs.

**Reference:** PRD Section 11 (Data Model), Section 13 (Technical Architecture), Section 19 (File Structure)

##### Tasks

- [ ] Create monorepo structure: `frontend/`, `backend/`, `docs/` — `backend/app/__init__.py`
  - Keep existing `src/`, `src-tauri/` intact (prototype reference)
  - Create `CLAUDE.md` at project root for web rebuild conventions
- [ ] Initialize FastAPI project — `backend/app/main.py`
  - **Sync** setup (not async) — use `sqlmodel.Session`, not async sessions
  - CORS middleware configured for Vercel frontend origin (**must be outermost middleware**)
  - Health check endpoint: `GET /health` (returns 200 + DB connection status)
- [ ] Define SQLModel table models — `backend/app/models/`
  - `user.py`: User (UUID PK, email, password_hash nullable, auth_provider, has_completed_onboarding bool default False, has_triaged_before bool default False, created_at)
  - `task.py`: Task (UUID PK, user_id FK, text VARCHAR(500), bucket StrEnum, domain_id FK nullable, parent_id FK nullable, status StrEnum, reschedule_count default 0, triaged_at DATE nullable, created_at, updated_at, completed_at nullable)
  - `domain.py`: Domain (UUID PK, user_id FK, name, color, position, UNIQUE on user_id+name)
  - `daily_stat.py`: DailyStat (composite PK on user_id+date using `PrimaryKeyConstraint` in `__table_args__`, tasks_added, tasks_completed)
  - **All relationships must use `lazy="raise"`** to prevent N+1 queries — force explicit `selectinload()` at query sites
- [ ] Define StrEnum types — `backend/app/models/enums.py`
  - `BucketType`: today, soon, later, someday
  - `TaskStatus`: pending, complete, archived
  - `AuthProvider`: email, google
  - Use `class BucketType(str, Enum)` with `auto()` — stored as TEXT in Postgres
- [ ] Configure Alembic — `backend/alembic/`
  - Date-prefixed migration filenames for chronological sorting
  - `env.py` configured to import SQLModel metadata: `from app.models import *` then `target_metadata = SQLModel.metadata`
  - Initial migration creates all 4 tables with indexes:
    - `idx_tasks_user_bucket_status` on (user_id, bucket, status)
    - `idx_tasks_parent` on (parent_id)
    - `idx_tasks_domain` on (domain_id)
    - `idx_domains_user` on (user_id)
    - `idx_daily_stats_user_date` on (user_id, date)
    - **Partial index for triage:** `CREATE INDEX idx_tasks_triage_candidates ON tasks (user_id, created_at) WHERE status = 'pending' AND parent_id IS NULL`
    - **Partial index for reaper:** `CREATE INDEX idx_tasks_reaper_candidates ON tasks (user_id, created_at) WHERE status = 'pending' AND bucket != 'today' AND parent_id IS NULL`
  - CHECK constraints on enum columns:
    - `CHECK (bucket IN ('today', 'soon', 'later', 'someday'))`
    - `CHECK (status IN ('pending', 'complete', 'archived'))`
    - `CHECK (auth_provider IN ('email', 'google'))`
- [ ] Database connection setup — `backend/app/core/config.py`, `backend/app/core/deps.py`
  - `get_db()` dependency yields sync Session with commit/rollback lifecycle (see Transaction Boundary Convention above)
  - Connection string from environment variable
  - Connection pool configuration:
    ```python
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=10,
    )
    ```

**Deliverable:** `alembic upgrade head` creates all tables with indexes and CHECK constraints. `GET /health` returns 200.

**Prototype reference:** `src-tauri/migrations/001_initial.sql` and `002_dynamic_domains_and_subtasks.sql` for schema patterns. Note: prototype uses INTEGER IDs → web uses UUIDs. Prototype has no user_id → web scopes everything by user_id.

##### Research Insights: Phase 1

**SQLModel StrEnum Storage:**
Do NOT use SQLAlchemy's native `Enum` type (which creates a Postgres ENUM via `CREATE TYPE`). Instead, use TEXT + CHECK:
```python
class Task(SQLModel, table=True):
    bucket: BucketType = Field(sa_column=Column(String, nullable=False))
    status: TaskStatus = Field(sa_column=Column(String, nullable=False, default="pending"))
```

**Composite Primary Key for DailyStat:**
```python
class DailyStat(SQLModel, table=True):
    __table_args__ = (PrimaryKeyConstraint("user_id", "date"),)
    user_id: UUID = Field(foreign_key="users.id")
    date: date = Field()
    tasks_added: int = Field(default=0)
    tasks_completed: int = Field(default=0)
```

**Cascade Pattern Detail:**
```python
# User → Tasks (CASCADE DELETE)
class User(SQLModel, table=True):
    tasks: list["Task"] = Relationship(
        back_populates="user",
        cascade_delete=True,
        sa_relationship_kwargs={"lazy": "raise"}
    )

class Task(SQLModel, table=True):
    user_id: UUID = Field(foreign_key="users.id", ondelete="CASCADE")

# Domain → Tasks (SET NULL — NOT cascade_delete)
class Domain(SQLModel, table=True):
    tasks: list["Task"] = Relationship(
        back_populates="domain",
        passive_deletes=True,
        sa_relationship_kwargs={"lazy": "raise"}
    )

class Task(SQLModel, table=True):
    domain_id: UUID | None = Field(
        default=None, foreign_key="domains.id", ondelete="SET NULL"
    )
```

**`triaged_at` Timezone Note:**
For v0.1.0, triage uses UTC dates. A user in PST triaging at 11pm local might get `tomorrow` in UTC. Acceptable for MVP; consider TIMESTAMPTZ or user timezone parameter in M2.

---

#### Phase 2: Backend Services & API

**Goal:** All business logic implemented in services layer, all API endpoints working (without auth — use a hardcoded test user).

**Reference:** PRD Section 12 (API Contracts), Section 17.2 (Agent-Native V1 Constraints)

##### 2a: Services Layer — `backend/app/services/`

All business logic goes here. Route handlers ONLY validate input and call services. This is the agent-native foundation (PRD Section 17.2).

- [ ] `task_service.py` — Task CRUD
  - `create_task(db, user_id, text, bucket?, domain_id?, parent_id?)` — enforce 500 char limit, 1-level sub-task depth (service-level check), inherit bucket/domain from parent, upsert daily_stats.tasks_added, **set `triaged_at = date.today()`** (prevents newly created tasks from re-triggering triage gate)
  - `get_tasks(db, user_id, bucket?, status?, domain_id?)` — filter with linear query builder pattern, **use `selectinload(Task.domain), selectinload(Task.children)`** on every list query
  - `get_task(db, user_id, task_id)` — single task lookup with domain and children loaded
  - `update_task(db, user_id, task_id, text?, bucket?, domain_id?)` — validate ownership, update updated_at
  - `complete_task(db, user_id, task_id)` — set status=complete + completed_at, cascade complete to pending children, upsert daily_stats.tasks_completed (only count parent)
  - `delete_task(db, user_id, task_id)` — cascade delete children (DB-level ON DELETE CASCADE)
  - **Prototype reference:** `commands.rs:18-266`

- [ ] `triage_service.py` — Triage flow
  - **Triage state tracking:** Each task has a `triaged_at DATE` field. When any triage action is taken, stamp `triaged_at = today()`. `GET /triage` returns pending top-level tasks where `triaged_at IS NULL OR triaged_at < today`. Triage is complete for the day when this result set is empty. This survives page refreshes and session expiration.
  - `get_triage_tasks(db, user_id)` — all pending top-level tasks where `triaged_at IS NULL OR triaged_at < today`, ordered by `created_at ASC` (oldest first). Response includes `total_count`, `completion_average`, and `triage_complete: bool`.
  - `triage_task(db, user_id, task_id, action, bucket?, rewritten_text?)` — four actions:
    - **confirm**: Task stays in current bucket (or moves to today if not already). No reschedule_count increment. Sets `triaged_at = today`. This is what the UI "Today" button maps to.
    - **defer**: Moves to specified bucket (soon/later/someday). Increments reschedule_count. Cascades bucket to children. Sets `triaged_at = today`.
    - **complete**: Delegates to `task_service.complete_task`. Sets `triaged_at = today`.
    - **kill**: **Deletes the task permanently** (delegates to `task_service.delete_task`). Kill ≠ archive. Archive is the reaper's domain.
  - If `rewritten_text` is provided and differs from current text, update text before applying action. If text is identical to current, return a `same_text_warning: true` flag (frontend shows "Same text — are you sure?" confirmation).
  - Auto-set `has_triaged_before = true` on user when triage completes for the first time (side effect in service).
  - `get_winddown_tasks(db, user_id)` — incomplete today tasks for evening re-triage
  - **Prototype reference:** `commands.rs:104-205` (but triage scope is different — PRD wins)

- [ ] `domain_service.py` — Domain management
  - `create_domain(db, user_id, name, color)` — enforce max 5 (service-level check), auto-assign position, enforce unique (user_id, name)
  - `update_domain(db, user_id, domain_id, name?, color?, position?)` — validate ownership
  - `delete_domain(db, user_id, domain_id)` — tasks get domain_id=NULL (DB-level ON DELETE SET NULL)
  - `get_domains(db, user_id)` — ordered by position
  - **Prototype reference:** `commands.rs:268-348`

- [ ] `stats_service.py` — Statistics
  - `get_nudge(db, user_id)` — 30-day rolling average of tasks_completed, today's pending count, today's completed count
  - `get_daily_stats(db, user_id, days=30)` — raw daily stats for charts
  - `upsert_stat(db, user_id, date, tasks_added_delta?, tasks_completed_delta?)` — **use raw SQL for atomicity**:
    ```python
    from sqlalchemy.dialects.postgresql import insert
    stmt = insert(DailyStat).values(
        user_id=user_id, date=today,
        tasks_added=tasks_added_delta, tasks_completed=tasks_completed_delta,
    ).on_conflict_do_update(
        index_elements=["user_id", "date"],
        set_={
            "tasks_added": DailyStat.__table__.c.tasks_added + tasks_added_delta,
            "tasks_completed": DailyStat.__table__.c.tasks_completed + tasks_completed_delta,
        },
    )
    db.execute(stmt)
    ```

- [ ] `reaper_service.py` — Auto-archive
  - `run_reaper(db, user_id?)` — two passes:
    1. Archive top-level pending tasks not in today bucket where `created_at` < 30 days ago
    2. Archive orphaned children of archived parents
  - If user_id provided, run for that user only. If None, run for all users (cron mode).
  - Return count of archived tasks.
  - **Prototype reference:** `src-tauri/src/reaper.rs` (uses `updated_at` — we use `created_at` per PRD)

##### 2b: Request/Response Schemas — `backend/app/schemas/`

- [ ] Pydantic models for every request and response
  - `task_schemas.py`: TaskCreate, TaskUpdate, TaskResponse (includes sub_tasks list, domain info, `age_days` computed field via `@computed_field`)
  - `triage_schemas.py`: TriageTaskResponse (adds reschedule_count, domain, sub_task_summary, triage_complete bool, total_count, completion_average), TriageAction (action: confirm|defer|complete|kill + optional bucket for defer + optional rewritten_text), TriageResult (includes same_text_warning bool)
  - `domain_schemas.py`: DomainCreate, DomainUpdate, DomainResponse
  - `stats_schemas.py`: NudgeResponse (today_count, completed_count, average_completed, message), DailyStatResponse
  - `error_schemas.py`: ErrorResponse (code: str, message: str) — machine-readable error codes

##### 2c: API Routes — `backend/app/api/`

- [ ] `tasks.py` — Task endpoints
  - `GET /tasks?bucket=&status=&domain_id=` → list tasks with filters
  - `GET /tasks/{task_id}` → single task with domain and children
  - `POST /tasks` → create task (body: TaskCreate)
  - `PATCH /tasks/{task_id}` → update task (body: TaskUpdate)
  - `POST /tasks/{task_id}/complete` → mark complete
  - `DELETE /tasks/{task_id}` → delete task + children

- [ ] `triage.py` — Triage endpoints
  - `GET /triage` → get pending tasks for triage (response includes completion_average, total_count)
  - `POST /triage/{task_id}` → process triage decision (body: TriageAction)
  - `GET /triage/winddown` → get incomplete today tasks for evening

- [ ] `domains.py` — Domain endpoints
  - `GET /domains` → list domains (ordered by position)
  - `POST /domains` → create domain
  - `PATCH /domains/{domain_id}` → update domain (including position)
  - `DELETE /domains/{domain_id}` → delete domain (tasks get NULL domain)

- [ ] `stats.py` — Stats endpoints
  - `GET /stats/nudge` → honest nudge data + message
  - `GET /stats/daily?days=30` → daily stats array

- [ ] `reaper.py` — Reaper endpoint
  - `POST /reaper/run` → trigger reaper (returns archived count) — **secured with a separate API key, not user JWT**

- [ ] `account.py` — Account endpoints
  - `GET /me` → current user profile
  - `DELETE /me` → delete account + all data (CASCADE)

- [ ] Error handling — `backend/app/core/errors.py`
  - Custom exception classes (NotFound, Forbidden, ValidationError, DomainLimitReached)
  - Exception handler that returns structured ErrorResponse
  - AppError base class:
    ```python
    class AppError(Exception):
        def __init__(self, code: str, message: str, status_code: int = 400):
            self.code = code
            self.message = message
            self.status_code = status_code
    ```

##### 2d: Backend Tests — `backend/tests/`

- [ ] `conftest.py` — test fixtures
  - Test database (shared with rollback per test)
  - Test user factory
  - Auth mock (bypass auth, inject user_id)
  - Domain factory, task factory

- [ ] Test files (each endpoint: happy path + at least one error case)
  - `test_tasks.py` — CRUD, sub-task depth enforcement, 500 char limit, cascade complete, cascade delete
  - `test_triage.py` — get triage tasks (all pending, not just today), defer with reschedule_count, complete during triage, kill during triage, rewrite text, **verify triaged_at = today on newly created tasks**
  - `test_domains.py` — CRUD, max-5 enforcement, unique name per user, delete sets tasks NULL
  - `test_stats.py` — nudge calculation, daily stats aggregation
  - `test_reaper.py` — archive stale tasks (30d on created_at), cascade to orphaned children, skip today-bucket tasks

**Deliverable:** All API endpoints return correct responses with test user. Full test suite passes. No auth required yet (hardcoded user for development).

##### Research Insights: Phase 2

**Linear Query Builder Pattern:**
```python
def get_tasks(self, db: Session, user_id: UUID, *, bucket: BucketType | None = None,
              status: TaskStatus | None = None, domain_id: UUID | None = None) -> list[Task]:
    query = select(Task).where(Task.user_id == user_id)
    if bucket is not None:
        query = query.where(Task.bucket == bucket)
    if status is not None:
        query = query.where(Task.status == status)
    if domain_id is not None:
        query = query.where(Task.domain_id == domain_id)
    query = query.options(selectinload(Task.domain), selectinload(Task.children))
    return db.exec(query).all()
```

**N+1 Prevention:**
Without `selectinload`, a list of 20 tasks with domains and children generates 41 queries. With `lazy="raise"` on relationships, forgetting to eagerly load raises an exception at dev time instead of silently degrading in production.

---

#### Phase 3: Authentication

**Goal:** User signup/login working with email/password, all API endpoints protected, sessions managed.

**Reference:** PRD Section 13 (Auth Flow)

- [ ] Initialize Next.js project — `frontend/`
  - App Router, TypeScript strict, Tailwind CSS
  - Minimal setup — just enough for auth pages

- [ ] NextAuth.js v5 configuration — `frontend/auth.ts` (v5 uses root-level `auth.ts`, not API route)
  - Email/password provider (CredentialsProvider) only for v0.1.0
  - JWT session strategy
  - User creation in FastAPI on first login
  - Configuration pattern:
    ```typescript
    // frontend/auth.ts
    export const { handlers, auth, signIn, signOut } = NextAuth({
      providers: [Credentials({...})],
      session: { strategy: "jwt" },
      callbacks: { signIn, jwt, session },
    })
    // frontend/app/api/auth/[...nextauth]/route.ts
    export { GET, POST } from "@/auth"
    ```

- [ ] Auth pages — `frontend/app/(auth)/`
  - `login/page.tsx` — email/password
  - `signup/page.tsx` — email/password registration
  - Minimal dark-themed styling (design tokens from playground)

- [ ] API proxy — `frontend/app/api/[...proxy]/route.ts`
  - Forward authenticated requests to FastAPI
  - **Sign a short-lived JWT (60 second TTL)** using `jose` library:
    ```typescript
    // frontend/lib/backend-jwt.ts
    import { SignJWT } from "jose"
    const secret = new TextEncoder().encode(process.env.INTERNAL_JWT_SECRET)
    export async function createBackendToken(userId: string): Promise<string> {
      return new SignJWT({ sub: userId })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("60s")
        .sign(secret)
    }
    ```
  - **Two separate secrets:** `NEXTAUTH_SECRET` for session management, `INTERNAL_JWT_SECRET` for proxy JWT signing.
  - Handle 401 → redirect to login

- [ ] FastAPI auth dependency — `backend/app/core/security.py`, `backend/app/core/deps.py`
  - `get_current_user(request)` dependency validates JWT signature and extracts user_id
  - Uses `INTERNAL_JWT_SECRET` (NOT `NEXTAUTH_SECRET`)
  - **Explicit algorithm validation:** `jwt.decode(token, SECRET, algorithms=["HS256"])`
  - All route handlers depend on `current_user`
  - Scope all DB queries to `current_user.id`

- [ ] User creation endpoint — `backend/app/api/account.py`
  - `POST /users` — called by NextAuth on first login
  - Creates user record + 5 default domains (Work, Personal, Health, Creative, Admin) with positions 0-4
  - **Normalize email:** `email = email.strip().lower()` before storage and lookup
  - Sets `has_completed_onboarding = False`, `has_triaged_before = False`
  - Handle race condition: if UNIQUE constraint on email fires (double-click), return existing user instead of 500

- [ ] Protected route middleware — `frontend/middleware.ts`
  - Redirect unauthenticated users to `/login`
  - Redirect authenticated users from `/login` to `/today`

- [ ] **Triage gate** — `frontend/app/(app)/layout.tsx` (Server Component, NOT middleware)
  - On every (app) route load, check triage status via API call
  - If user has untriaged tasks (`triage_complete: false`), redirect to `/triage`
  - **Exception:** `/settings` and `/onboarding` are always accessible
  - If user has 0 pending tasks total (new user, all caught up), skip triage — go straight to `/today`

**Deliverable:** Users can sign up and log in with email/password. All API calls are authenticated. Default domains created on signup.

##### Research Insights: Phase 3

**NextAuth v5 Breaking Changes:**
- Configuration lives in `auth.ts` at project root (not in API route)
- Uses `export const { handlers, auth, signIn, signOut } = NextAuth({...})`
- `auth()` replaces `getServerSession()` for Server Components
- Middleware uses `auth` as a wrapper: `export { auth as middleware } from "./auth"`

**Proxy Catch-All Route Pattern:**
```typescript
// frontend/app/api/[...proxy]/route.ts
async function handler(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const backendToken = await createBackendToken(session.user.id)
  const backendUrl = `${process.env.BACKEND_URL}/${params.proxy.join("/")}`
  const res = await fetch(backendUrl, {
    method: req.method,
    headers: { "Authorization": `Bearer ${backendToken}`, "Content-Type": "application/json" },
    body: req.method !== "GET" ? await req.text() : undefined,
  })
  return new NextResponse(res.body, { status: res.status, headers: { "Content-Type": "application/json" } })
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE }
```

---

#### Phase 4: Frontend Core

**Goal:** All four main screens working, connected to real API, dark theme applied.

**Reference:** PRD Section 7 (User Flows), Section 14 (Design Principles), playground design tokens

##### 4a: Frontend Foundation

- [ ] Tailwind + shadcn/ui setup
  - Dark theme tokens from playground:
    ```
    bg-root: #0a0a0a, bg-card: #1a1a1a, bg-input: #111111
    bg-hover: #252525, bg-surface: #141414
    text-primary: #fafafa, text-secondary: #888888, text-muted: #555555
    border: #2a2a2a
    accent-green: #22c55e, accent-red: #ef4444, accent-amber: #f59e0b, accent-blue: #3b82f6
    ```
  - System font stack, monospace for code/values

- [ ] **OpenAPI-to-TypeScript generation** — `frontend/lib/api-types.ts`
  - Generate TypeScript types from FastAPI's OpenAPI schema using `openapi-typescript`
  - Run as a build step: `npx openapi-typescript http://localhost:8000/openapi.json -o lib/api-types.ts`
  - Single source of truth from backend schemas

- [ ] Typed API client — `frontend/lib/api.ts`
  - Fetch wrapper with auth headers, error handling, typed responses (using generated types)
  - One function per endpoint

- [ ] Utility functions — `frontend/lib/utils.ts`
  - `formatAge(days)` — "now", "1d", "3d", "1w", "2w", "1mo"
  - `shouldShowAge(days, bucket)` — bucket-relative visibility rules from PRD
  - `ageColorClass(days, bucket)` — bucket-relative color thresholds
  - **Prototype reference:** `src/api.ts:112-137` (simpler version → use PRD rules)

- [ ] App layout — `frontend/app/(app)/layout.tsx`
  - Dark theme shell
  - Bottom navigation (mobile): Triage, Today, Soon, Later, Someday, Settings
  - Sidebar navigation (desktop)
  - Triage gate check (see Phase 3)

##### 4b: Shared Components — `frontend/components/`

- [ ] `task-card.tsx` — Triage card (the most important component)
  - Task text (quoted), domain badge with color dot, age badge (always shown during triage)
  - Defer count indicator, sub-task summary ("2 of 4 done")
  - Rewrite prompt state (shown when reschedule_count >= 3): editable input, "same text" confirmation if user doesn't change it
  - Six action buttons: Today (→ confirm), Soon/Later/Someday (→ defer), Done (→ complete), Kill (→ delete permanently)
  - When completing a parent with sub-tasks: brief confirmation "Completed {task} and {n} sub-tasks"
  - **Prototype reference:** `src/views/triage.ts`

- [ ] `task-item.tsx` — Task list item (for Today/Bucket views)
  - Task text, domain dot, age badge (conditional per bucket)
  - Expand arrow for sub-tasks
  - Complete checkbox (when completing parent: confirmation showing count)
  - Delete action (swipe or long-press on mobile, hover icon on desktop)
  - Delete parent with children: confirmation dialog
  - **Prototype reference:** `src/components/task-item.ts`

- [ ] `task-input.tsx` — Task creation form
  - Text input (500 char limit with counter)
  - Domain selector (cycle through domains or dropdown)
  - Submit on Enter
  - **Prototype reference:** `src/components/task-input.ts`

- [ ] `domain-badge.tsx` — Domain color indicator
  - Small colored dot + optional name label

##### 4c: Screen Pages

- [ ] Triage page — `frontend/app/(app)/triage/page.tsx`
  - Fetch triage tasks from `GET /triage`
  - Render one `task-card` at a time with currentIndex state
  - Progress indicator: "3 of 12 triaged"
  - Submit decisions via `POST /triage/{task_id}`, advance index on success
  - Auto-navigate to Today when complete
  - **Prototype reference:** `src/views/triage.ts`

- [ ] Today page — `frontend/app/(app)/today/page.tsx`
  - Honest nudge at top: "{count} tasks today — you usually complete about {avg}"
  - Domain filter dots (click to filter)
  - Pending tasks list (task-item components)
  - Completed tasks below (dimmed, collapsible)
  - Task input at bottom
  - "Wind Down" button (navigates to wind-down triage)
  - **Prototype reference:** `src/views/today.ts`

- [ ] Bucket page — `frontend/app/(app)/bucket/[b]/page.tsx`
  - Dynamic route for soon/later/someday
  - Back button, bucket title
  - Task list (task-item components)
  - Task input at bottom
  - **Prototype reference:** `src/views/today.ts`

- [ ] Settings page — `frontend/app/(app)/settings/page.tsx`
  - **Domains section:**
    - Domain list (name + color dot + edit/delete buttons)
    - Add domain button (grayed out at 5)
    - Domain edit inline (name + color picker — preset palette of 8-10 colors)
    - Delete domain confirmation: "Tasks in {domain} will become untagged. Continue?"
  - **Account section:**
    - Email display (read-only)
    - Delete account button → confirmation dialog
    - Calls `DELETE /me` on confirmation
  - **Prototype reference:** `src/views/settings.ts`

**Deliverable:** All four screens render with real data. User can triage, create tasks, complete tasks, manage domains.

##### Research Insights: Phase 4

**Server Components + Client Components Pattern:**
- Server Components for data fetching (pages, layouts)
- Client Components for interactivity (`"use client"` — triage card, task input, domain editor)
- Pass data from Server to Client via props, not client-side fetching

---

#### Phase 5: Onboarding & Progressive Education

**Goal:** New users guided through setup, first-time states teach concepts in context.

**Reference:** PRD Section 7.1 (Onboarding), Section 8 (Progressive Education)

- [ ] Onboarding flow — `frontend/app/(app)/onboarding/page.tsx`
  - **Step 1 (Welcome):** "Tend helps you decide what matters today." Single "Get Started" button.
  - **Step 2 (Domains):** Pre-populated 5 domains (Work, Personal, Health, Creative, Admin). User can rename, delete, or keep. "These are your life domains."
  - **Step 3 (First Tasks):** 3 empty task inputs. "Add a few things on your mind." Domain selector per task. Skip option.
  - Redirect to Today view on completion.
  - Gate: show when `has_completed_onboarding === false`. After completing Step 3 (or skipping), set `has_completed_onboarding = true` as a side effect in the onboarding completion API call.
  - Tasks created in onboarding default to `bucket = "today"` (and `triaged_at = date.today()` via task creation service)

- [ ] First-time triage education — `frontend/app/(app)/triage/page.tsx` (conditional)
  - When `has_triaged_before === false`:
    - Show explainer card above first triage card: "Each morning, Tend asks you to decide: is this task for today, soon, later, or someday?"
    - Add sub-labels under action buttons: Today → "Do it today", Soon → "This week", Later → "This month", Someday → "No rush", Done → "Already done", Kill → "Not worth doing"
    - After completing first triage, `has_triaged_before` auto-set by triage_service (side effect)

- [ ] First-time Today education — `frontend/app/(app)/today/page.tsx` (conditional)
  - When it's user's first time seeing Today view after triage:
    - Annotate the nudge: explain what the number means
    - If empty: "Nothing here yet. After triage, your today tasks appear here."

- [ ] Empty states for all views
  - Today (no tasks): "Your day is clear. Add a task below or wait for tomorrow's triage."
  - Bucket (empty): "Nothing in {bucket} right now."
  - Triage (nothing to triage): "All caught up. Come back tomorrow morning."

**Deliverable:** New users complete onboarding in ~60 seconds. First triage includes education. All empty states render correctly.

---

#### Phase 6: Polish & Deploy

**Goal:** App is production-ready, deployed, and handles edge cases gracefully.

**Reference:** PRD Section 9 (Error States), Section 14 (Design Principles), Section 18 (Milestones M1)

##### 6a: Wind-Down Flow

- [ ] Evening wind-down triage
  - "Wind Down" button on Today view triggers `GET /triage/winddown`
  - Returns incomplete today tasks
  - Same triage card UI, but only today's leftovers
  - Options: keep for tomorrow (Today), defer (Soon/Later/Someday), Done, Kill

##### 6b: Triage Empty State Routing

- [ ] If `GET /triage` returns 0 tasks, do NOT render triage screen — skip directly to Today view
  - This handles: new users with 0 tasks, users who already triaged, users returning after all tasks archived

##### 6c: Mobile Responsiveness

- [ ] Mobile-first layout (PRD: "primary use case is morning triage on a phone")
  - Triage card: full-width, thumb-reachable action buttons
  - Today/Bucket: scrollable task list, fixed input at bottom
  - Settings: inline domain editing
  - Bottom tab navigation on mobile
  - Sidebar navigation on desktop (768px+)

##### 6d: Error Handling

- [ ] Network error states (offline, timeout)
- [ ] API error display (structured errors → user-friendly messages)

##### 6e: Reaper Scheduling

- [ ] **External cron** to run reaper daily
  - Use cron-job.org (free) to call `POST /reaper/run` daily at 4am UTC
  - Secure with a separate API key: `X-Reaper-Key: <REAPER_API_KEY>`

##### 6f: Deployment

- [ ] Frontend deployment — Vercel
  - `frontend/` as Vercel project root
  - **Region:** `iad1` (US East — co-located with Railway)
  - Environment variables: `NEXTAUTH_SECRET`, `INTERNAL_JWT_SECRET`, `NEXTAUTH_URL`, `BACKEND_URL`
  - **NEXTAUTH_URL gotcha:** For preview deployments, use `VERCEL_URL` fallback:
    ```typescript
    const baseUrl = process.env.NEXTAUTH_URL || `https://${process.env.VERCEL_URL}`
    ```
  - Build command: `next build`

- [ ] Backend deployment — Railway
  - `backend/` as Railway project root
  - **Region:** `us-east4` (co-located with Vercel iad1)
  - Environment variables: `DATABASE_URL`, `ALLOWED_ORIGINS`, `INTERNAL_JWT_SECRET`, `REAPER_API_KEY`
  - **Use Dockerfile** (not nixpacks — more predictable):
    ```dockerfile
    FROM python:3.12-slim AS base
    WORKDIR /app
    COPY requirements.txt .
    RUN pip install --no-cache-dir -r requirements.txt
    COPY . .
    COPY start.sh .
    RUN chmod +x start.sh
    CMD ["./start.sh"]
    ```
  - **start.sh:**
    ```bash
    #!/bin/bash
    set -e
    alembic upgrade head
    exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
    ```
  - Managed PostgreSQL addon (Railway Starter plan sufficient)

- [ ] **Cold-start mitigation**
  - Set up a keep-alive pinger (cron-job.org, free) hitting `GET /health` every 5 minutes

- [ ] Health checks
  - `GET /health` returns 200 + DB connection status

**Deliverable:** App is live. Users can sign up, onboard, triage, manage tasks, and access from any device. Reaper runs daily. Estimated cost: ~$5-10/month.

##### Research Insights: Phase 6

**Deployment Cost Breakdown:**
| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Vercel | Free (Hobby) | $0 |
| Railway (FastAPI) | Starter | ~$5 |
| Railway (PostgreSQL) | Starter addon | ~$5 |
| cron-job.org | Free | $0 |
| **Total** | | **~$5-10/month** |

**Cold Start Timeline:**
Container starts (1-2s) → Python imports (1-2s) → Alembic check (0.5-1s) → DB pool warming (0.5-1s) → **Total: 3-6 seconds** on first request after idle. Keep-alive pinger prevents this during active hours.

---

## Acceptance Criteria

### Functional Requirements

- [ ] Users can sign up and log in with email/password
- [ ] Users can create, read, update, complete, and delete tasks
- [ ] Tasks support one level of sub-tasks (sub-sub-tasks rejected)
- [ ] Sub-tasks inherit bucket and domain from parent
- [ ] Completing a parent auto-completes pending children (with confirmation showing count)
- [ ] Deleting a parent cascades to children (with confirmation dialog showing count)
- [ ] Empty task text is rejected (validation error)
- [ ] Newly created tasks get `triaged_at = date.today()` (don't re-trigger triage gate)
- [ ] Users can create up to 5 domains with name and color
- [ ] Deleting a domain sets affected tasks' domain to NULL (with confirmation)
- [ ] Morning triage presents ALL pending top-level tasks, one at a time, oldest first
- [ ] **Triage blocks access**: user cannot navigate to Today/Bucket views until triage is complete (settings always accessible)
- [ ] **Triage state survives refresh**: partial triage progress is preserved via `triaged_at` on tasks
- [ ] Triage "Today" button confirms task without incrementing reschedule_count
- [ ] Triage "Soon/Later/Someday" defers task, increments reschedule_count, cascades to children
- [ ] Triage "Done" completes task (+ cascade children)
- [ ] Triage "Kill" permanently deletes task (not archive)
- [ ] Rewrite prompt appears when reschedule_count >= 3; "same text" confirmation if text unchanged
- [ ] If 0 tasks need triage, skip triage screen — go directly to Today
- [ ] Honest nudge shows 30-day completion average vs today's count
- [ ] Evening wind-down re-triages incomplete today tasks
- [ ] Reaper auto-archives non-today tasks older than 30 days (by created_at)
- [ ] Onboarding: 3-step flow (Welcome, Domains, First Tasks) gated by `has_completed_onboarding`
- [ ] First-time triage includes explainer card and button sub-labels
- [ ] All views have appropriate empty states
- [ ] Age badges follow bucket-relative visibility and color rules
- [ ] Task text limited to 500 characters
- [ ] Account settings: delete account with confirmation

### Non-Functional Requirements

- [ ] API response time < 200ms for all endpoints (same-region deployment)
- [ ] Dark theme only (v0.1.0)
- [ ] Mobile-first responsive design
- [ ] All business logic in services layer (agent-native constraint)
- [ ] Structured error responses with machine-readable codes
- [ ] All endpoints scoped to authenticated user (no cross-user data leaks)
- [ ] Auth uses signed JWT between Next.js proxy and FastAPI (two separate secrets, 60s TTL)
- [ ] Concurrent edit strategy: last-write-wins (PRD Section 9)
- [ ] N+1 queries prevented via `lazy="raise"` + explicit `selectinload()`

### Quality Gates

- [ ] Every API endpoint has at least one happy-path test and one error-case test
- [ ] Ruff passes with no warnings (backend)
- [ ] Prettier passes with no warnings (frontend)
- [ ] TypeScript strict mode compiles with no errors
- [ ] No hardcoded secrets in codebase
- [ ] Alembic migration runs cleanly on fresh database
- [ ] OpenAPI schema generates valid TypeScript types

## Dependencies & Prerequisites

| Dependency | Status | Notes |
|------------|--------|-------|
| PostgreSQL instance | Needed | Railway managed DB, or local for dev |
| Vercel account | Needed | Free tier sufficient for v0.1.0 |
| Railway account | Needed | Starter plan for FastAPI + PostgreSQL (~$5-10/month) |
| Domain name | Optional | Can use Railway/Vercel default URLs for v0.1.0 |
| cron-job.org account | Needed | Free tier, for keep-alive pinger + reaper cron |

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| NextAuth ↔ FastAPI auth complexity | Medium | High | Email/password only for v0.1.0. Break Phase 3 circular dependency with temporary hardcoded user. |
| SQLModel relationship gotchas | Medium | Medium | Use `cascade_delete=True` (not legacy 3-piece pattern). Test cascades early in Phase 1. |
| Scope creep beyond M1 | High | High | This plan IS the scope. If it's not listed here, it's not in v0.1.0. |
| Triage UX feels different from prototype | Low | Medium | Use playground presets for visual QA. Test with real morning triage session. |
| Railway cold starts (3-8s) | Medium | Medium | Keep-alive pinger on cron-job.org hitting /health every 5 minutes. |
| N+1 query performance | Medium | High | `lazy="raise"` on all relationships catches missing eager loads at dev time. |
| `triaged_at DATE` timezone edge case | Low | Medium | Document UTC-only for v0.1.0. Consider TIMESTAMPTZ in M2. |
| Proxy latency (Vercel→Railway) | Low | Medium | Co-locate in same region (iad1 + us-east4). |

## Build Order Summary

| Phase | Focus | Depends On | Key Insight |
|-------|-------|------------|-------------|
| 1 | Project scaffolding + data layer | Nothing | Foundation — partial indexes and pool config from the start |
| 2 | Backend services + API + tests | Phase 1 | Largest phase — all business logic. `lazy="raise"` + `selectinload` patterns. |
| 3 | Authentication | Phase 1 (backend) | Email/password only. Break circular dependency with temporary hardcoded user. Two separate JWT secrets. |
| 4 | Frontend core (4 screens) | Phase 2 + 3 | Second largest. Use OpenAPI-generated types. |
| 5 | Onboarding + education | Phase 4 | Builds on existing screens. Flag updates as service-layer side effects. |
| 6 | Polish + deploy | All above | Co-locate regions. Dockerfile for Railway. External cron for reaper. |

## Future Considerations (NOT in v0.1.0)

These are explicitly out of scope. Listed here to prevent scope creep.

- Google OAuth (fast-follow within M1, after core works)
- Password reset flow (M2 — handle manually for now)
- Password change + session invalidation (M2)
- Rate limiting on auth endpoints (M2)
- Light theme / system preference (M2)
- PWA + offline support (M2)
- Push notifications (M2)
- Keyboard shortcuts (M2)
- Welcome back message after long absence (M2)
- First archive banner (M2)
- Optimistic UI with rollback (M2)
- Data import from Tauri JSON export (M2)
- Domain reorder endpoint (M2)
- Task uncomplete endpoint (M2)
- DB-level triggers for constraint enforcement (M2)
- Email verification on signup (M2)
- User timezone preference (M2)
- Stripe / paid sync tier (M3)
- Data export (M3)
- Archive browser with restore (M4)
- Public API + webhooks + API versioning (M4)
- `GET /api/v1/state` endpoint (M5)
- MCP tool wrappers (M5)
- Agent conversational layer (M5)

## References & Research

### Internal References

- PRD: `/Users/brandon/dev/tend/docs/PRD.md` (v2.0, 19 sections)
- UI Playground: `/Users/brandon/dev/tend/docs/tend-playground.html` (definitive design reference)
- Previous plan: `/Users/brandon/dev/tend/docs/plans/2026-02-05-feat-dynamic-domains-and-subtasks-plan.md`
- Prototype business logic: `src-tauri/src/commands.rs`, `src-tauri/src/reaper.rs`
- Prototype frontend: `src/views/triage.ts`, `src/views/today.ts`, `src/views/settings.ts`

### Knowledge Base References

- SQLModel cascade pattern: `~/.claude/knowledge-base/sqlmodel.md`
- Sync vs async Python: `~/.claude/knowledge-base/learnings/async-python-performance.md`
- StrEnum pattern: `~/.claude/knowledge-base/learnings/enums.md`
- Database testing: `~/.claude/knowledge-base/testing.md`
- Alembic guide: `~/.claude/knowledge-base/alembic.md`
- Database configuration: `~/.claude/knowledge-base/database.md`

### PRD Sections by Phase

| Phase | Key PRD Sections |
|-------|-----------------|
| 1 | 11 (Data Model), 13 (Architecture), 19 (File Structure) |
| 2 | 12 (API Contracts), 17.2 (Agent-Native V1 Constraints) |
| 3 | 13 (Auth Flow) |
| 4 | 7 (User Flows), 14 (Design Principles), 10.1 (P0 Features) |
| 5 | 7.1 (Onboarding), 8 (Progressive Education) |
| 6 | 9 (Error States), 18 (Milestones M1) |

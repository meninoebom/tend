# Tend — Claude Code Project Guide

## What is Tend?

Tend is a "conscious todo app" — it forces a daily morning triage where you decide what matters today. Core concepts: forced triage, honest nudge (shows your actual completion average), domain bucketing (up to 5 life domains), auto-archive reaper (30-day cleanup), and one-level sub-tasks.

## Current State

**Prototype:** Tauri v2 desktop app (Rust backend + vanilla TS frontend + SQLite) in `src-tauri/` and `src/`. Fully functional single-user app. Reference only.

**Web app (live):** Next.js + FastAPI + PostgreSQL. Deployed to Railway. All 6 phases complete (data layer, API + services, auth, frontend core, onboarding, polish). v0.2.0 security hardening + password reset done. Remaining ops work: reaper cron scheduling, make backend private on Railway.

## Key Documents

- **PRD:** `docs/PRD.md` (v2.0, 19 sections) — the definitive product spec
- **Implementation plan:** `docs/plans/2026-02-06-feat-tend-web-v0.1.0-mvp-plan.md` — v0.1.0 MVP, 6 phases
- **UI playground:** `docs/tend-playground.html` — interactive design reference (dark theme tokens, all 4 screens)
- **Prototype reference:** `src-tauri/src/commands.rs` (business logic), `src-tauri/src/reaper.rs` (auto-archive)

## Architecture (v0.1.0)

```
Browser → Next.js (Railway) → FastAPI (Railway) → PostgreSQL (Railway)
```

- **Frontend:** Next.js App Router, TypeScript strict, Tailwind CSS, dark theme only
- **Backend:** FastAPI (sync, not async), SQLModel, Alembic migrations
- **Auth:** NextAuth.js v5 (email/password only for v0.1.0), proxy-signed JWT (60s TTL, `jose` library)
- **Two separate secrets:** `NEXTAUTH_SECRET` for sessions, `INTERNAL_JWT_SECRET` for proxy JWT
- **Deployment:** Single Railway project with 3 services (frontend, backend, PostgreSQL)

## Critical Technical Decisions

### Enums: StrEnum as TEXT (not native ENUM)
```python
bucket: BucketType = Field(sa_column=Column(String, nullable=False))
```
Avoids `ALTER TYPE` migration pain. CHECK constraints enforce valid values.

### Cascades: SQLModel-native pattern
- User→Tasks, User→Domains, Task→Children: `cascade_delete=True` + `ondelete="CASCADE"`
- Domain→Tasks: `ondelete="SET NULL"` + `passive_deletes=True` (NOT cascade_delete)

### N+1 Prevention
All relationships use `lazy="raise"`. Every list query must explicitly use `selectinload()`.

### Transaction Boundaries
Services NEVER call `db.commit()`. The `get_db()` dependency owns commit/rollback.

### Triage State
`triaged_at DATE` field on tasks. Stamped when triaged. `GET /triage` returns where `triaged_at IS NULL OR triaged_at < today`. Newly created tasks get `triaged_at = date.today()` to prevent re-triggering triage gate.

### Daily Stats Upsert
Composite PK (user_id, date). Use `INSERT ... ON CONFLICT DO UPDATE` (raw SQL via SQLAlchemy `insert().on_conflict_do_update()`).

### Rate Limiting (v0.2.0)
slowapi with in-memory storage. Auth endpoints (signup/login) are called server-to-server from Next.js, so `get_remote_address` sees the Next.js IP — rate limits are effectively global (5 signups/min, 10 logins/min total). Resets on deploy. Disabled in tests via `RATE_LIMIT_ENABLED=false`. Limiter lives in `core/rate_limit.py` to avoid circular imports.

### Password Reset (v0.2.0)
JWT-based tokens, no database migration. Token encodes `{sub: user_id, purpose: "password_reset", exp: +1hr}` signed with `INTERNAL_JWT_SECRET`. The `purpose` claim prevents proxy JWTs from being used as reset tokens. Email sent via Resend SDK. Forgot-password always returns 200 to prevent user enumeration.

### Unauthenticated API Routes
The main `[...proxy]` catch-all requires a NextAuth session. Endpoints that must work without auth (password reset, etc.) need their own routes in `frontend/src/app/api/` that forward to the backend directly. Same pattern as `auth.ts` calling `/users` and `/users/verify`.

## Project Structure

```
tend/
├── frontend/           # Next.js app (Railway)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/     # login, signup, forgot-password, reset-password
│   │   │   ├── (app)/      # triage, today, winddown, bucket/[b], settings
│   │   │   └── api/        # NextAuth + proxy catch-all + password-reset
│   │   ├── components/     # triage-card, task-item, task-input, domain-badge
│   │   ├── lib/            # api.ts, api-types.ts, utils.ts, backend-jwt.ts
│   │   └── auth.ts         # NextAuth v5 config
│   ├── railway.toml
│   └── .node-version       # Node 20 for Railway Nixpacks
├── backend/            # FastAPI app (Railway)
│   ├── app/
│   │   ├── api/        # routes: tasks, triage, domains, stats, reaper, account
│   │   ├── core/       # config, deps (get_db), security, errors, rate_limit
│   │   ├── models/     # user, task, domain, daily_stat, enums
│   │   ├── schemas/    # request/response Pydantic models
│   │   └── services/   # task_service, triage_service, domain_service, stats_service, reaper_service
│   ├── alembic/        # migrations (date-prefixed filenames)
│   ├── tests/          # 55 tests, shared DB with rollback per test
│   ├── start.py        # Railway startup: validate env, run migrations, start uvicorn
│   └── railway.toml
├── docs/               # PRD, plans, playground, solutions/learnings
│   └── log/            # Build-in-public learning journal (numbered entries)
├── src/                # (prototype — reference only)
├── src-tauri/          # (prototype — reference only)
└── CLAUDE.md           # this file
```

## Build Phases

1. ~~**Scaffolding & Data Layer**~~ — monorepo, FastAPI, SQLModel models, Alembic, indexes
2. ~~**Services & API**~~ — all business logic in services, all endpoints, 55 tests
3. ~~**Authentication**~~ — NextAuth v5, email/password, proxy JWT, user creation
4. ~~**Frontend Core**~~ — 4 screens (triage, today, bucket, settings), hand-written TS types, deployed to Railway
5. ~~**Onboarding**~~ — 3-step flow, first-time triage education, empty states
6. ~~**Polish**~~ — wind-down nav swap, task input relocation, archived tasks view, delete error handling

## Conventions

- **Python:** Ruff for linting, sync SQLModel (not async), service-layer pattern (services own logic, routes own validation)
- **TypeScript:** Strict mode, Prettier, hand-written types matching backend schemas
- **Git:** Branch naming per `~/.claude/CLAUDE.md` conventions (feature/, bugfix/, etc.)
- **Testing:** Shared DB with rollback per test, factory fixtures, auth mock
- **Migrations:** Date-prefixed Alembic filenames, pre-flight verification

## After Completing Work (Agent Self-Assessment)

Before wrapping up a non-trivial PR, self-assess:
- What was the hardest decision or trickiest problem?
- Did anything surprise you or require a workaround?
- Would a future session benefit from knowing this?
If yes, update this CLAUDE.md with the pattern or gotcha — don't wait to be asked.

## Learning Log — Brandon's Journal (Build in Public)

After completing a task (commit + PR created), offer a reflection prompt:

> "This might be worth a log entry — want to reflect on it, or skip?"

**Skip-worthy:** typo fixes, dependency bumps, minor CSS tweaks, config changes.
**Log-worthy:** new features, architecture decisions, deployment milestones, anything where a decision was made or something was learned.

If Brandon says yes (or the work is clearly substantial):

1. **Summarize** — Write a 2-3 sentence summary of what was built and why
2. **Coach** — Ask Brandon 2-3 reflection questions that:
   - Connect the specific work to broader product/engineering concepts
   - Surface a dimension he hasn't covered recently (check `docs/log/README.md`)
   - Push toward "founder thinking" — not just "what" but "why" and "what did you learn"
3. **Capture** — After Brandon responds, create the log entry in `docs/log/NNN-slug.md`
4. **Update** — Update the dimensions table in `docs/log/README.md`

If Brandon says skip, move on. No guilt, no log entry.

Coaching questions should feel like a conversation, not an exam. Examples:
- "The click-vs-double-click decision in task-item — how did you think about that UX trade-off?"
- "This was a frontend-only change. What would need to change on the backend if you wanted to add edit history?"
- "You're 4 phases into a 6-phase plan. What's surprised you most about the gap between planning and building?"
- "If a hiring manager read this PR, what would you want them to notice about how you work?"

The log lives at `docs/log/`. Entries are numbered (001, 002, ...) with slug filenames.

## Railway Deployment Notes

Both services deploy to Railway in a single project with managed PostgreSQL. Key learnings:

- **postgres:// → postgresql://** — Railway Postgres uses `postgres://` scheme but SQLAlchemy requires `postgresql://`. Normalized in `config.py` via `model_validator`.
- **Same project required** — All services must be in the same Railway project for variable references (`${{ServiceName.VAR}}`) to resolve.
- **start.py pattern** — Backend uses `start.py` (not Procfile directly) to validate env vars, run Alembic migrations, then exec uvicorn.
- **Node 20** — Set via `frontend/.node-version` for Railway Nixpacks (Next.js 16 requires >= 20.9.0).
- **NextAuth on Railway** — Requires `AUTH_TRUST_HOST=true` and explicit `NEXTAUTH_SECRET`.
- **Shared variables** — `INTERNAL_JWT_SECRET` is a Railway Shared Variable used by both frontend and backend.
- ~~**Debug endpoint** — removed in v0.2.0 (was leaking backend URL)~~
- **New v0.2.0 env vars** — `RESEND_API_KEY` (backend), `FRONTEND_URL` (backend, for reset email links)
- **Make backend private** — TODO: Remove public domain from backend service in Railway dashboard. All traffic should go through Next.js proxy. Only expose webhook endpoints publicly if needed later.

Full details: `docs/solutions/deployment-issues/railway-two-service-deployment.md`

## Frontend Patterns & Gotchas

### Nav bar: Triage ↔ Wind Down swap
Triage and Wind Down are mutually exclusive (morning gate vs evening flow). Once `triageChecked` is true in `layout.tsx`, the Triage nav slot swaps to Wind Down (moon icon). This was the result of 4 rejected placement attempts — the lesson is that repurposing existing UI beats adding new UI when two features are temporally exclusive.

### Sticky bottom elements overlap
If a page uses `sticky bottom-0` (e.g., task input) inside `<main>`, it will be hidden behind the layout's `sticky bottom-0` nav bar. Two sticky-bottom elements in nested containers fight. **Solution:** Don't use sticky-bottom for page content. The task input now lives at the top of the task list (standard Todoist/Things pattern), not stuck to the bottom.

### Wind-down page: use local index tracking, NOT backend `remaining`
The wind-down page reuses `TriageCard` but must NOT check `result.remaining` or `result.triage_complete` from triage actions. Those values reflect morning triage state across all buckets, not wind-down state. Instead, track `currentIndex` locally and advance through the `tasks[]` array. When `currentIndex >= tasks.length - 1`, redirect to `/today`.

### Always add try/catch to async handlers that set loading state
If `setLoading(true)` runs before an API call and the call fails without a catch, `loading` stays `true` permanently, disabling the button forever. Every `async function handleX()` that sets loading needs a try/catch that resets loading on failure. Pattern:
```tsx
async function handleDelete() {
  if (loading) return;
  setLoading(true);
  try {
    await deleteTask(task.id);
    onMutate();
  } catch (err) {
    console.error("Failed to delete:", err);
    setLoading(false);
  }
}
```

### Archived tasks: backend already supports it
`GET /tasks?status=archived` works out of the box — the task listing endpoint accepts status as a query param, and `TaskStatus.archived` is already in the enum. The frontend `getTasks({ status: "archived" })` also works. The archived tasks view on the Someday page was 38 lines of JSX with zero backend changes. **Lesson:** Check existing API capabilities before planning new endpoints.

### Inline read-only rendering vs reusable component
`TaskItem` is 410 lines of interactive state (editing, subtasks, delete, domain picker). For the archived tasks view (read-only: text + domain dot + bucket label + age), inline JSX is simpler than threading a `readOnly` prop through 10+ conditional branches. Don't force reuse when the use case is fundamentally different.

### Native `<details>/<summary>` for disclosure
Use native HTML `<details>` instead of `useState` toggles for collapsible sections. Zero JavaScript, accessible by default, semantically correct. Style with Tailwind. Used for the archived tasks disclosure on the Someday page.

## What's Deferred (NOT v0.1.0)

Google OAuth, password reset/change, rate limiting, keyboard shortcuts, optimistic UI, import endpoint, DB triggers, Sentry, welcome-back messages. All documented in the Future Considerations section of the plan.

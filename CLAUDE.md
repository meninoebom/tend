# Tend — Claude Code Project Guide

## What is Tend?

Tend is a "conscious todo app" — it forces a daily morning triage where you decide what matters today. Core concepts: forced triage, honest nudge (shows your actual completion average), domain bucketing (up to 5 life domains), auto-archive reaper (30-day cleanup), and one-level sub-tasks.

## Current State

**Prototype:** Tauri v2 desktop app (Rust backend + vanilla TS frontend + SQLite) in `src-tauri/` and `src/`. Fully functional single-user app. Reference only.

**Web app (live):** Next.js + FastAPI + PostgreSQL. Deployed to Railway. Phases 1-4 complete (data layer, API + services, auth, frontend core). Phases 5-6 remaining (onboarding, polish).

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

## Project Structure

```
tend/
├── frontend/           # Next.js app (Railway)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/     # login, signup
│   │   │   ├── (app)/      # triage, today, bucket/[b], settings
│   │   │   └── api/        # NextAuth + proxy catch-all + debug
│   │   ├── components/     # triage-card, task-item, task-input, domain-badge
│   │   ├── lib/            # api.ts, api-types.ts, utils.ts, backend-jwt.ts
│   │   └── auth.ts         # NextAuth v5 config
│   ├── railway.toml
│   └── .node-version       # Node 20 for Railway Nixpacks
├── backend/            # FastAPI app (Railway)
│   ├── app/
│   │   ├── api/        # routes: tasks, triage, domains, stats, reaper, account
│   │   ├── core/       # config, deps (get_db), security (JWT validation), errors
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
5. **Onboarding** — 3-step flow, first-time triage education, empty states
6. **Polish** — wind-down, mobile responsiveness, error handling refinements

## Conventions

- **Python:** Ruff for linting, sync SQLModel (not async), service-layer pattern (services own logic, routes own validation)
- **TypeScript:** Strict mode, Prettier, hand-written types matching backend schemas
- **Git:** Branch naming per `~/.claude/CLAUDE.md` conventions (feature/, bugfix/, etc.)
- **Testing:** Shared DB with rollback per test, factory fixtures, auth mock
- **Migrations:** Date-prefixed Alembic filenames, pre-flight verification

## Learning Log (Build in Public)

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
- **Debug endpoint** — `frontend/src/app/api/debug/route.ts` reports env var status. Remove before production.

Full details: `docs/solutions/deployment-issues/railway-two-service-deployment.md`

## What's Deferred (NOT v0.1.0)

Google OAuth, password reset/change, rate limiting, keyboard shortcuts, optimistic UI, import endpoint, DB triggers, Sentry, welcome-back messages. All documented in the Future Considerations section of the plan.

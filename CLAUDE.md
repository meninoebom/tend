# Tend — Claude Code Project Guide

## What is Tend?

Tend is a "conscious todo app" — it forces a daily morning triage where you decide what matters today. Core concepts: forced triage, honest nudge (shows your actual completion average), domain bucketing (up to 5 life domains), auto-archive reaper (30-day cleanup), and one-level sub-tasks.

## Current State

**Prototype:** Tauri v2 desktop app (Rust backend + vanilla TS frontend + SQLite) in `src-tauri/` and `src/`. Fully functional single-user app.

**Web rebuild (in progress):** Next.js + FastAPI + PostgreSQL. Greenfield build informed by the prototype — not a port.

## Key Documents

- **PRD:** `docs/PRD.md` (v2.0, 19 sections) — the definitive product spec
- **Implementation plan:** `docs/plans/2026-02-06-feat-tend-web-v0.1.0-mvp-plan.md` — v0.1.0 MVP, 6 phases
- **UI playground:** `docs/tend-playground.html` — interactive design reference (dark theme tokens, all 4 screens)
- **Prototype reference:** `src-tauri/src/commands.rs` (business logic), `src-tauri/src/reaper.rs` (auto-archive)

## Architecture (v0.1.0)

```
Browser → Next.js (Vercel, iad1) → FastAPI (Railway, us-east4) → PostgreSQL (Railway)
```

- **Frontend:** Next.js App Router, TypeScript strict, Tailwind + shadcn/ui, dark theme only
- **Backend:** FastAPI (sync, not async), SQLModel, Alembic migrations
- **Auth:** NextAuth.js v5 (email/password only for v0.1.0), proxy-signed JWT (60s TTL, `jose` library)
- **Two separate secrets:** `NEXTAUTH_SECRET` for sessions, `INTERNAL_JWT_SECRET` for proxy JWT

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

## Project Structure (target)

```
tend/
├── frontend/           # Next.js app (Vercel)
│   ├── app/
│   │   ├── (auth)/     # login, signup
│   │   ├── (app)/      # triage, today, bucket/[b], settings, onboarding
│   │   └── api/        # NextAuth + proxy catch-all
│   ├── components/     # task-card, task-item, task-input, domain-badge
│   ├── lib/            # api.ts, api-types.ts (generated), utils.ts, backend-jwt.ts
│   └── auth.ts         # NextAuth v5 config
├── backend/            # FastAPI app (Railway)
│   ├── app/
│   │   ├── api/        # routes: tasks, triage, domains, stats, reaper, account
│   │   ├── core/       # config, deps (get_db), security (JWT validation), errors
│   │   ├── models/     # user, task, domain, daily_stat, enums
│   │   ├── schemas/    # request/response Pydantic models
│   │   └── services/   # task_service, triage_service, domain_service, stats_service, reaper_service
│   ├── alembic/        # migrations (date-prefixed filenames)
│   ├── tests/          # shared DB with rollback per test
│   ├── Dockerfile
│   └── start.sh        # alembic upgrade head + uvicorn
├── docs/               # PRD, plans, playground
├── src/                # (prototype — reference only)
├── src-tauri/          # (prototype — reference only)
└── CLAUDE.md           # this file
```

## Build Phases

1. **Scaffolding & Data Layer** — monorepo, FastAPI, SQLModel models, Alembic, indexes
2. **Services & API** — all business logic in services, all endpoints, tests (hardcoded test user)
3. **Authentication** — NextAuth v5, email/password, proxy JWT, user creation
4. **Frontend Core** — 4 screens (triage, today, bucket, settings), OpenAPI-generated types
5. **Onboarding** — 3-step flow, first-time triage education, empty states
6. **Polish & Deploy** — wind-down, mobile responsiveness, error handling, Railway + Vercel

## Conventions

- **Python:** Ruff for linting, sync SQLModel (not async), service-layer pattern (services own logic, routes own validation)
- **TypeScript:** Strict mode, Prettier, OpenAPI-generated types from backend schema
- **Git:** Branch naming per `~/.claude/CLAUDE.md` conventions (feature/, bugfix/, etc.)
- **Testing:** Shared DB with rollback per test, factory fixtures, auth mock
- **Migrations:** Date-prefixed Alembic filenames, pre-flight verification

## What's Deferred (NOT v0.1.0)

Google OAuth, password reset/change, rate limiting, keyboard shortcuts, optimistic UI, import endpoint, DB triggers, Sentry, welcome-back messages. All documented in the Future Considerations section of the plan.

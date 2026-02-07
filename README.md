# Tend

A conscious todo app built around a daily triage ritual. Tend rejects feature bloat in favor of forced intentionality — every task must be actively categorized, stale tasks are auto-archived, and honest nudges keep you grounded in reality.

## Core Concepts

- **Morning triage** — You cannot access your task list without triaging first. One card at a time.
- **Four buckets** — Today, Soon, Later, Someday. Every task lives in exactly one.
- **Honest nudge** — "8 tasks today — you usually complete about 5." Based on your 30-day average.
- **Auto-archive reaper** — Tasks in non-Today buckets older than 30 days are archived. If it mattered, you'd have done it.
- **Forced rewrite** — Tasks deferred 3+ times trigger a rewrite prompt. The task may be poorly framed.
- **Max 5 life domains** — Intentional constraint to prevent over-categorization.

## Architecture

```
Browser → Next.js (Railway) → FastAPI (Railway) → PostgreSQL (Railway)
```

- **Frontend:** Next.js App Router, TypeScript strict, Tailwind CSS, dark theme only
- **Backend:** FastAPI, SQLModel, Alembic migrations
- **Auth:** NextAuth.js v5 (email/password), proxy-signed JWT for backend calls
- **Database:** PostgreSQL (Railway managed)

## Project Structure

```
tend/
├── frontend/           # Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/     # Login, signup pages
│   │   │   ├── (app)/      # Triage, today, bucket/[b], settings
│   │   │   └── api/        # NextAuth + proxy catch-all
│   │   ├── components/     # Shared UI: triage-card, task-item, task-input, domain-badge
│   │   ├── lib/            # API client, types, backend-jwt, utils
│   │   └── auth.ts         # NextAuth v5 config
│   ├── railway.toml
│   └── .node-version
├── backend/            # FastAPI app
│   ├── app/
│   │   ├── api/        # Routes: tasks, triage, domains, stats, reaper, account
│   │   ├── core/       # Config, deps, security, errors
│   │   ├── models/     # SQLModel: user, task, domain, daily_stat, enums
│   │   ├── schemas/    # Pydantic request/response models
│   │   └── services/   # Business logic: task, triage, domain, stats, reaper
│   ├── alembic/        # Database migrations
│   ├── tests/          # 55 pytest tests
│   ├── start.py        # Railway startup (migrations + uvicorn)
│   └── railway.toml
├── docs/
│   ├── PRD.md          # Product requirements (v2.0, 19 sections)
│   ├── plans/          # Implementation plans
│   └── solutions/      # Documented learnings
├── src/                # (Tauri prototype — reference only)
├── src-tauri/          # (Tauri prototype — reference only)
└── CLAUDE.md           # AI agent project guide
```

## Local Development

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL (local or Docker)
- [uv](https://docs.astral.sh/uv/) (Python package manager)

### Backend

```bash
cd backend

# Install dependencies
uv sync

# Set up environment
cp .env.example .env  # Edit DATABASE_URL, INTERNAL_JWT_SECRET

# Run migrations
uv run alembic upgrade head

# Start dev server
uv run uvicorn app.main:app --reload --port 8000

# Run tests
uv run pytest -q
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local  # Edit BACKEND_URL, INTERNAL_JWT_SECRET, NEXTAUTH_SECRET

# Start dev server
npm run dev
```

### Environment Variables

**Backend** (`.env`):
```
DATABASE_URL=postgresql://localhost:5432/tend_dev
INTERNAL_JWT_SECRET=your-shared-secret
ALLOWED_ORIGINS=http://localhost:3000
REAPER_API_KEY=your-reaper-key
```

**Frontend** (`.env.local`):
```
BACKEND_URL=http://localhost:8000
INTERNAL_JWT_SECRET=your-shared-secret  # Same as backend
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

## Deployment (Railway)

Both services deploy to Railway as a single project with managed PostgreSQL. See `docs/solutions/deployment-issues/railway-two-service-deployment.md` for detailed setup notes.

Key configuration:
- Backend: `python start.py` runs Alembic migrations then uvicorn
- Frontend: `.node-version` set to 20 for Nixpacks
- Shared variables: `INTERNAL_JWT_SECRET` shared between services
- Frontend needs: `AUTH_TRUST_HOST=true`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`

## Current Status

**Phase 4 of 6 complete** (Phases 1-4: data layer, API, auth, frontend core). App is live on Railway.

Remaining:
- Phase 5: Onboarding flow, first-time education, empty states
- Phase 6: Polish — wind-down, mobile responsiveness, error handling refinements

See `docs/plans/2026-02-06-feat-tend-web-v0.1.0-mvp-plan.md` for the full implementation plan.

## Tests

```bash
cd backend && uv run pytest -q  # 55 tests
cd frontend && npm run build    # Type checking + build verification
```

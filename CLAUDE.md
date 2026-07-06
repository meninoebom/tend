# Tend — Claude Code Project Guide

## What is Tend?

Tend is a "conscious todo app" — it forces a daily morning triage where you decide what matters today. Core concepts: forced triage, domain bucketing (up to 5 life domains), auto-composting (30-day cleanup), and one-level sub-tasks.

## Current State

**Prototype:** Tauri v2 desktop app (Rust backend + vanilla TS frontend + SQLite) in `src-tauri/` and `src/`. Fully functional single-user app. Reference only.

**Web app (live):** Next.js + FastAPI + PostgreSQL. Deployed to Railway with custom domain. All 6 phases complete (data layer, API + services, auth, frontend core, onboarding, polish). v0.2.0 security hardening + password reset done. v0.3.0 adds priority fields (important/urgent) and 4 layout modes. Composting runs automatically per-user during triage (no cron needed).

## Key Documents

- **PRD:** `docs/PRD.md` (v2.0, 19 sections) — the definitive product spec
- **Implementation plan:** `docs/plans/2026-02-06-feat-tend-web-v0.1.0-mvp-plan.md` — v0.1.0 MVP, 6 phases
- **UI playground:** `docs/tend-playground.html` — interactive design reference (dark theme tokens, all 4 screens)
- **Prototype reference:** `src-tauri/src/commands.rs` (business logic), `src-tauri/src/reaper.rs` (auto-archive, old naming)

## Architecture (v0.1.0)

```
Browser → Next.js (Railway) → FastAPI (Railway) → PostgreSQL (Railway)
```

- **Frontend:** Next.js App Router, TypeScript strict, Tailwind CSS, light/dark theme toggle
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

All domain enums live in `app/models/enums.py`: `BucketType`, `TaskStatus`, `AuthProvider`, `SubscriptionStatus`, `LayoutType`. When adding a new constrained string field, add its enum here and use it in the model, schema, and route — Pydantic validates automatically, no hand-rolled set-membership check needed.

### Scalar COUNT queries: use scalar_one(), not one()
`db.exec(sa_select(func.count()).where(...)).one()` returns a `Row` tuple `(N,)`, not an int. Always use `.scalar_one()` for COUNT queries:
```python
count = db.exec(sa_select(func.count()).where(...)).scalar_one()
```

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

### Personal Access Tokens (PATs) — scoping by opt-in dependency
External clients (Plot, Raycast, iOS Shortcuts) authenticate with a `tend_pat_...` token instead of the 60s proxy JWT. Design:
- `api_tokens` table stores only a **SHA-256 hash** of the raw token (fast, unsalted — auth looks a token up by hash without knowing the user). The raw value is shown **once** at creation.
- `core/security.py` has two dependencies: `get_current_user_id` (proxy-JWT only, the default for every route) and `get_user_id_allow_pat` (accepts a PAT **or** the proxy JWT).
- **Scoping is expressed by which routes use `get_user_id_allow_pat`** — there is no per-path allowlist. A PAT works only on the endpoints that opted in (currently `GET/POST /tasks`, `POST /tasks/{id}/complete`, `POST /tasks/{id}/mit`, `GET /triage`, `POST /tasks/{id}/placements`). To expose a new endpoint to PATs, switch its dependency; to keep it internal, leave `get_current_user_id`.
- **Test gotcha:** `conftest.py` must override *both* auth dependencies. To test real PAT auth/scoping, pop the overrides in a fixture (see `TestPatScoping` in `test_api_tokens.py`).

### Task Placements — Tend records, never schedules
`task_placements` stores the fact that Plot placed a task into a time block (`{task_id, date, block_start, block_type, calendar_event_id}`), upserting on `(task_id, date)`. This does **not** make Tend a calendar — it records a reported fact the way `reschedule_count` does. `POST /tasks/{id}/placements` is PAT-scoped. `TaskResponse.placement` carries **today's** placement (passed explicitly to `_to_response`, never via `task.placements` — that relationship is `lazy="raise"`; use `placement_service.get_placements_for_date` to build a `{task_id: placement}` map and pass it in). Wind-down uses placement to distinguish "had a block, didn't finish" (planning-honesty) from "never got a block" (triage-honesty).

### Status transitions: complete→pending is a "reopen"
`update_task` allows `pending↔archived` **and** `complete→pending` (clears `completed_at`). The reopen exists so keyboard-triage undo can revert a "Done". `complete→archived` is still invalid.

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
│   │   ├── api/        # routes: tasks, triage, domains, stats, account
│   │   ├── core/       # config, deps (get_db), security, errors, rate_limit
│   │   ├── models/     # user, task, domain, daily_stat, enums
│   │   ├── schemas/    # request/response Pydantic models
│   │   └── services/   # task_service, triage_service, domain_service, stats_service, composter_service
│   ├── alembic/        # migrations (date-prefixed filenames)
│   ├── tests/          # 75 tests, shared DB with rollback per test
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

## Local Dev via mise

tend is polyglot (Next.js frontend + FastAPI backend + a reference Tauri prototype), so
`mise.toml` at the root pins the toolchains and orchestrates tasks across both halves. See
`~/projects/knowledge-base/mise.md`.

```bash
mise install        # node 20, pnpm 10.33, python 3.13, uv (matches Railway)
mise run dev        # Next.js + FastAPI together
mise run check      # eslint + tsc (web) and ruff + pytest (api) — mirrors CI
mise run test       # backend pytest only
mise run migrate    # alembic upgrade head
mise run build      # production Next.js build
mise tasks ls       # all tasks (incl. desktop:dev / desktop:build for the Tauri prototype)
```

Notes:
- **Frontend is on pnpm** (pinned via `packageManager` + `mise.toml [tools]`); CI and
  `frontend/railway.toml` use pnpm too. The root Tauri prototype and the repo-root husky hooks
  are still on npm — run `npm install` at the root once to wire up husky.
- **bcrypt** is a declared frontend dep with a native build step, allowlisted via
  `frontend/package.json` `pnpm.onlyBuiltDependencies`; sharp + unrs-resolver use prebuilt
  binaries (no approval). `next.config.ts` pins `turbopack.root` so Next doesn't mistake the
  repo root (which still has an npm lockfile) for the frontend's workspace root.
- **uv owns the Python venv, not mise** — mise's `python = "3.13"` pin matches `.python-version`,
  but `uv run` reuses an existing `.venv`. `rm -rf backend/.venv && uv sync` rebuilds on 3.13.
- **CI gotcha:** never pipe `mise run check` through `tail` — it masks mise's exit code.

## Conventions

- **Python:** Ruff for linting **and formatting** — CI runs both `ruff check` and `ruff format --check` as separate steps. Always run `uv run ruff check . && uv run ruff format .` before pushing, or `ruff check . --fix && ruff format .` to auto-fix. Lint-only passes are not enough.
- **TypeScript:** Strict mode, Prettier, hand-written types matching backend schemas
- **Git:** Branch naming per `~/.claude/CLAUDE.md` conventions (feature/, bugfix/, etc.)
- **Testing:** Shared DB with rollback per test, factory fixtures, auth mock
- **Migrations:** Date-prefixed Alembic filenames, pre-flight verification
- **Pre-commit hooks:** husky + lint-staged at the repo root auto-fix staged files on commit — ESLint `--fix` on `frontend/**`, Ruff `check --fix` + `format` on `backend/**` (scoped to staged files, so it's fast). Activate by running `npm install` at the repo root once (the `prepare` script wires up husky). The wrapper scripts (`scripts/precommit-*.sh`) no-op if that stack's tools aren't installed, so they never block a commit; bypass with `git commit --no-verify` if needed. CI still enforces the same checks on PRs as the source of truth.

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
- **⚠ Prod deploy is GATED on the CI status check — CI MUST run on `push: [main]`, not PR-only.** Railway deploys `main` only after a CI `check` passes *on the squash-merge commit*. If CI is PR-only, the merge commit has no check and Railway waits forever — prod silently freezes (this happened May 26–Jun 4 2026: PR #183 went PR-only, prod froze at #183 until #206 restored the push trigger). `.github/workflows/ci.yml` must keep `on: push: branches: [main]`. After any CI-trigger change, verify `gh pr checks <recent-pr>` still shows the `Tend - Tend Frontend/Backend` deploy checks and that the prod deployment commit equals `origin/main`. Cross-project writeup: `~/projects/knowledge-base/github-actions-cost-control.md`.
- **Node 20** — Set via `frontend/.node-version` for Railway Nixpacks (Next.js 16 requires >= 20.9.0).
- **NextAuth on Railway** — Requires `AUTH_TRUST_HOST=true` and explicit `NEXTAUTH_SECRET`.
- **Shared variables** — `INTERNAL_JWT_SECRET` is a Railway Shared Variable used by both frontend and backend.
- ~~**Debug endpoint** — removed in v0.2.0 (was leaking backend URL)~~
- **New v0.2.0 env vars** — `RESEND_API_KEY` (backend), `FRONTEND_URL` (backend, for reset email links)
- **Custom domain setup** — Use ALIAS or CNAME flattening for apex domains (DNS provider dependent). After domain is live, update `NEXTAUTH_URL` (frontend) and `FRONTEND_URL` (backend) env vars, then remove the public `.railway.app` domain from backend service. All traffic flows through Next.js proxy. See README.md for detailed DNS setup instructions.

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

### Composting (auto-archive)
Stale tasks (>30 days, non-today bucket) are automatically archived per-user during `GET /triage`. No cron job needed — the composter runs inside a `db.begin_nested()` savepoint so failures never block triage. Two passes: (1) stale top-level tasks, (2) orphaned children of any archived parent. Status transition validation enforces `pending↔archived` only via PATCH; `complete_task()` has its own endpoint.

### Light/Dark Theme
`ThemeProvider` in `frontend/src/components/theme-provider.tsx` wraps the app. Theme stored in `localStorage`, toggled via class on `<html>`. Tailwind v4 `@theme` (NOT `@theme inline`) generates CSS `var()` references that respond to runtime overrides in `globals.css`. `suppressHydrationWarning` on `<html>` prevents React mismatch.

### Layout switcher: 4 modes, persisted to backend
`LayoutMode = "list" | "grouped" | "quadrant" | "matrix"` (in `api-types.ts`). The active layout is:
- Stored on `User.default_layout` (backend, `LayoutType` StrEnum)
- Loaded via `getMe()` on mount, saved via `updateMe({ default_layout })` on change
- Locally held in a `layout` state var initialized to `null` (shows loading spinner until `getMe()` resolves)

`LAYOUT_DESCRIPTIONS` and `LayoutSwitcher` component live in `components/layout-switcher.tsx` — import descriptions from there, not inline in pages. `BucketTabs` (shared tab bar for grouped/quadrant) lives in `components/layouts/bucket-tabs.tsx`. `PriorityLegend` lives in `components/priority-legend.tsx`.

The "needs all tasks" layouts (grouped, quadrant, matrix) fetch `getTasks()` with no bucket filter and pass the full list down; individual layouts filter client-side. Only the list layout fetches `getTasks({ bucket })`.

### Quadrant drag-and-drop: idiomatic `useDroppable`, not manual hit-testing
The Quadrant view (`components/layouts/quadrant-layout.tsx`) supports dragging cards between Eisenhower cells (changes `important`/`urgent` via `setPriority`) and onto bucket tabs (changes `bucket` via `updateTask`). Two patterns worth reusing:

- **Use dnd-kit's `useDroppable` + `pointerWithin`, NOT the Today-*list*'s manual approach.** The list view does cross-bucket drag by hand — `data-drop-bucket` DOM attributes + a `handleDragMove` that reads pointer coords and calls `getBoundingClientRect()` on every nav node — because its drop targets (nav links) live *outside* the page component. In Quadrant, the cells **and** tabs live inside one component, so plain `useDroppable` works. Don't copy the list's hit-testing hack when your drop targets are in-component. (The list view was intentionally left as-is — working code, out of scope.)
- **`useDroppable` can't be called in a `.map` loop** (Rules of Hooks). Extract a per-item component that calls the hook once: `QuadrantCell` (one per cell), `DroppableTab` (one per tab inside `DroppableBucketTabs`).
- **No nested `DndContext`:** QuadrantLayout mounts its own `DndContext`, which is safe only because the layout branches (list/grouped/quadrant/matrix) are mutually exclusive ternary arms — exactly one mounts at a time.

### Optimistic DnD overlay: clear on `[tasks]`, and only because the parent's array ref is stable
The DnD layouts apply drops instantly via the shared `useOptimisticTaskDnd` hook (`components/layouts/use-optimistic-task-dnd.ts`): an `overrides` map (field patches — `{ important?, urgent?, bucket?, domain? }`) plus an `orderOverride` (per-bucket id order for reorders), both layered over the `tasks` prop and cleared with `useEffect(() => { setOverrides({}); setOrderOverride(null); }, [tasks])`. This is flicker-free **only because** the parent passes `tasks={allTasks}` — a `useState` value mutated solely inside `refresh()`. So the `tasks` reference changes **only on a refetch**, which is itself triggered by our `onMutate()` and already reflects the change. If a parent recomputes/filters the array inline on each render instead, the effect wipes the overlay every render and optimism breaks. **Before adding an optimistic overlay keyed on a prop, verify that prop's reference is stable between the relevant updates.**

### Drag-and-drop: shared-ordering model across all four layouts
All four layouts support DnD. List uses its own legacy sortable + nav hit-testing (left as-is). Grouped, Quadrant, and Matrix share one architecture:

- **One ordering, four lenses.** `Task.position` is a per-(user, bucket) order that every view sorts by *within its groups* (List = whole bucket, Grouped = by domain, Quadrant = by important×urgent, Matrix = by domain×bucket). Backend populates/reads it for **every** bucket (`task_service._next_position`, `get_tasks` orders by position nulls-last). No per-view ordering, no extra column.
- **Order is sacred.** Two drag ops: **reorder** (card → another card in the *same* group) updates `position` via `reorderTasks(ids, bucket)`; **reclassify** (card → a different group or a bucket tab) changes an attribute (`domain_id` / `important`+`urgent` / `bucket`) and never touches order — except a bucket change appends to the destination. Changing priority does NOT float a task in the List.
- **Shared hook `useOptimisticTaskDnd`** provides `effectiveTasks`, `applyOverride` (reclassify), `applyReorder` (reorder), `sensors`, `activeId`/`activeTask` (DragOverlay), and exports **`reorderAwareCollision`** — prefer card targets (`closestCenter` among `kind: "reorder-card"` droppables) when over a card, else `pointerWithin` for group containers + bucket tabs. Each view supplies its own `onDragEnd`.
- **Reorder without `SortableContext`.** Each `DraggableTaskItem` is *also* a `useDroppable` (`kind: "reorder-card"`) with an insertion-line indicator on `isOver`. `onDragEnd` uses `arrayMove` (imported from `@dnd-kit/sortable`, no SortableContext needed) over the bucket's id list. Drop-on-card in a different group falls back to reclassify (drop-on-card == drop-on-that-group).
- **Empty groups must render** (every domain/cell, even empty) so they're valid drop targets.
- **Verify DnD in a browser, not just CI.** CI runs lint/types/build — none exercise a drag. Use the Playwright + DB-ground-truth approach (see `.llm/raw-learnings.md`): mouse.down on the grip, move +8px past the 5px threshold, move to target in steps, mouse.up; then assert the DB row changed. The grip is `opacity-0` until hover and collapses in compact cells, so compute coords in a single `page.evaluate()` with `getBoundingClientRect()`.

### Duplicate React keys in static config arrays → render loop
Any static array that drives a rendered list (LAYOUTS, TABS, BUCKETS) must have unique `value` fields. Two elements with the same `key` cause React reconciliation to fire `onChange` spuriously — looks exactly like an infinite re-render/state loop. TypeScript validates shape, not uniqueness.

**Rule:** When adding an entry to LAYOUTS, BUCKET_TABS, BUCKETS, or any similar array, scan for duplicate `value` fields. Use `key={\`${item.value}-${i}\`}` as insurance.

Full write-up: `docs/solutions/code-quality/react-duplicate-keys-render-loop.md`

### Dev environment: backend/.env must match frontend/.env.local secrets
The backend has no `.env` file committed. When starting a fresh backend process, create `backend/.env` with:
```
DATABASE_URL=postgresql://brandon@localhost:5432/tend_dev
INTERNAL_JWT_SECRET=dev-only-change-in-production
```
If `INTERNAL_JWT_SECRET` doesn't match what's in `frontend/.env.local`, every proxied API call returns 401 → `window.location.href = "/login"` → redirect back → looks like a render loop. The backend defaults to `"change-me"` which won't match.

### useRef objects must NOT appear in useCallback or useEffect deps arrays
Refs are stable object identities — their `.current` can change without React knowing, so listing a ref in deps provides no benefit and creates false expectations. The correct pattern for reading a ref inside a stable callback:
```ts
const layoutRef = useRef<LayoutMode | null>(null);
useEffect(() => { layoutRef.current = layout; }, [layout]); // sync via effect, not during render
const refresh = useCallback(() => {
  const effective = layoutRef.current; // read at call time, not at creation
  ...
}, []); // stable — no layoutRef in deps
```

**Note:** Assigning `ref.current = value` directly during render (outside useEffect) triggers the `react-hooks/refs` ESLint rule in `eslint-config-next` ("Cannot access refs during render"). The `useEffect` wrapper avoids this. There's no meaningful semantic difference since `refresh` is only called in event handlers and effects, never synchronously during render.

### mountedRef for setState-after-unmount is unnecessary in React 18+
React 18 removed the warning for calling setState on unmounted components. The `mountedRef` + cleanup `useEffect` pattern is dead code in this codebase. Don't add it.

### Mobile tap targets: 44px minimum
All interactive elements must meet the 44px minimum tap target on mobile. Patterns:
- Primary and secondary buttons: add `min-h-[44px]` alongside any `py-X` padding
- Small visual buttons (color dots, icon-only triggers): wrap the visual element in an `h-11 w-11` (`44px`) container, keep inner visual at its original size
- Floating dropdowns: use `flex-col` with `min-h-[44px]` per item, not a horizontal pill row
- `ritual-overlay.tsx` already handles `100dvh` and `pb-[max(2rem,env(safe-area-inset-bottom))]` for iOS home indicator clearance

### Color picker layout on mobile
The 10 preset color dots in settings (`h-7 w-7` each) should NOT be in a single `flex` row alongside an input and action buttons — that row overflows at 320px. Structure as `flex-col`: color dots row first (`flex flex-wrap gap-1.5`), input + buttons row second.

### Floating popovers: portal + vertical menu
Floating popovers anchored to a row inside `SortableTaskItem` (or any `transform`-wrapped ancestor — dnd-kit applies one even when idle) get trapped in that ancestor's stacking context, so `z-index` alone can't lift them. Two-part rule:
1. **Always portal** floating popovers to `document.body` via `createPortal`, position with `fixed` from `getBoundingClientRect()` on the trigger. Bumping `z-index` on absolute-positioned children does nothing here.
2. **Use a vertical menu (`flex flex-col` + fixed width like `w-[140px]`)**, not a horizontal pill row. Horizontal rows scale with item count and overflow narrow viewports / sidebars / quadrant cards; vertical menus never do.

`domain-picker.tsx` follows this pattern. Mirror it for any new task-row popover.

### Capture token grammar
`lib/parse-capture.ts` is a **pure** function that pulls inline tokens out of a task string: `#domain` (prefix-matched against the user's domains, first match wins), `!` (important), `!!` (important+urgent), `u!`/`!u` (urgent), `>today|soon|later|someday` (bucket), `~s|~m|~l` (size). Recognized tokens are stripped from the text; unrecognized `#tags` are left verbatim. `task-input.tsx` submits on a single Enter (refocuses for rapid-fire; never disables the input) and opens the domain/priority picker on **Tab**, not Enter. The `/capture` PWA share-target page reuses the same parser.

### Keyboard-driven triage + undo
`triage-card.tsx` binds a window `keydown` listener (ignored while a text input/textarea is focused or in rewrite/note edit): `t/s/l/o` bucket, `d` done, `x` let go, `n` note, `r` rewrite, `1/2/3` size, `z` undo. **"Let go" is a reversible soft-archive** (`updateTask status=archived`), not the hard-delete `kill` triage action — so undo can restore it (archived tasks live on the Someday page). The undo stack lives in `triage-flow.tsx`: each action records `{index, taskId, action, prevBucket}`; `z` moves the index back and issues a compensating `updateTask` (restore bucket, or `status=pending` to un-archive / reopen). Advancement is **index-based**, not driven by the server's `remaining`, so synthesized results (from the archive path) work too.

### PWA share target
`app/manifest.ts` (Next metadata route) declares a `share_target` pointing at `/capture`; `public/sw.js` is a deliberately no-op service worker (installability only, **no** offline caching/sync); `components/pwa-register.tsx` registers it from the root layout. `share_target` isn't in Next's `Manifest` type — extend it locally with a cast.

## Merging PRs

After creating a PR:
1. Run `gh pr checks <PR> --watch` to wait for CI to complete (timeout: 5 min)
2. If checks pass, run `gh pr merge <PR> --squash --delete-branch`
3. If checks fail, read the failure, fix it, push, and repeat from step 1
4. Only tell the user "it's deploying" after confirming the merge actually happened via `gh pr view <PR> --json state`

## What's Removed

**Honest nudge (PR #159):** The numerical feedback banner ("6 tasks today, you usually finish ~5") was removed from the Today page and the 30-day average comparison was removed from the wind-down modal. The backend `/stats/nudge` endpoint, `DailyStat` model, and stats tracking still exist (used by briefing service) but are no longer consumed by the frontend. The wind-down modal still shows MIT completion status. The nudge was removed because numerical metrics created performance pressure rather than supporting intentional task management.

## What's Deferred

Google OAuth, keyboard shortcuts, optimistic UI, import endpoint, DB triggers, Sentry, welcome-back messages. All documented in the Future Considerations section of the plan.

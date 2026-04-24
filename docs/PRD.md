# Tend — Product Requirements Document

**Version:** 2.0
**Date:** 2026-02-06
**Author:** Brandon
**Status:** Draft

---

## 1. Product Vision

Tend is a conscious todo app built around a daily triage ritual. It rejects feature bloat in favor of forced intentionality — every task must be actively categorized, stale tasks are auto-archived, and honest nudges keep you grounded in reality.

---

## 2. Problem Statement

Most todo apps fail the same way: they become graveyards. Tasks accumulate without review, lists grow unbounded, and the app becomes a source of anxiety rather than clarity.

Tend solves this through **ritual and constraints**:

- You must triage every pending task before starting your day
- You see how many tasks you *actually* complete vs. how many you *claim* you'll do
- Tasks that linger too long are auto-archived — if it mattered, you'd have done it
- Tasks deferred 3+ times trigger a rewrite prompt — the task may be poorly framed

---

## 3. Glossary

| Term | Definition |
|------|-----------|
| **Bucket** | One of four time-horizon categories: Today, Soon (this week), Later (not now), Someday (be honest). Every pending task lives in exactly one bucket. |
| **Domain** | A user-defined life area (e.g., "Work", "Health", "Music"). Max 5. Used for filtering and light categorization. |
| **Triage** | The core ritual. A card-by-card review of all pending tasks where the user assigns each to a bucket or resolves it. Triage must be completed before accessing the task list. |
| **Defer** | Moving a task to a different bucket during triage. Each defer increments the task's `reschedule_count`. |
| **Rewrite prompt** | When a task has been deferred 3+ times, the user is prompted to rewrite the task text before deferring again. The assumption: a task deferred this many times is probably poorly framed. |
| **Reaper** | The background process that auto-archives tasks in non-Today buckets older than 30 days. |
| **Honest nudge** | A message shown on the Today view: "X tasks today — you usually complete about Y." Based on 30-day rolling average. |
| **Kill** | Permanently deleting a task during triage. Distinct from archiving (which is automatic and reversible). |
| **Age badge** | A visual indicator showing how long a task has existed (from `created_at`). Displayed as Xd/Xw/Xmo. Visibility is **bucket-relative** — the badge only appears when a task's age is suspicious for its current bucket (see Age Badge Rules below). Always visible during triage to inform bucket decisions. |
| **Wind-down** | Optional evening triage of incomplete Today tasks to re-categorize them for tomorrow. |
| **Sub-task** | A child task nested under a parent. One level deep only — no grandchildren. Inherits parent's bucket and domain. |

---

## 4. Core Philosophy (Non-Negotiable)

These principles must survive every iteration unchanged:

| Principle | Implementation |
|-----------|---------------|
| **Morning triage is mandatory** | You cannot access your task list without triaging first |
| **Four buckets, no more** | Today, Soon, Later, Someday |
| **Honest nudge** | Show 30-day completion average vs. today's claimed count |
| **Auto-archive** | Tasks in non-today buckets older than 30 days are archived |
| **Forced rewrite** | Tasks deferred 3+ times prompt text revision |
| **One level of sub-tasks** | No grandchildren — this is not a project manager |
| **Max 5 life domains** | Intentional constraint to prevent over-categorization |
| **Minimal UI** | The app gets out of the way |

---

## 5. Target Users

**Primary:** Individual knowledge workers who want a simple, opinionated system for daily task management.

**Characteristics:**

- Overwhelmed by feature-rich tools (Todoist, Notion, Asana)
- Value intentionality and reflection over raw productivity
- Want a system that enforces good habits, not just enables them
- Comfortable with constraints as a feature

**Anti-users:**

- Teams needing collaboration features
- People who want Gantt charts, dependencies, or project timelines
- Power users who want infinite customization

---

## 6. Decisions (Resolved)

These are settled. Do not revisit.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Architecture** | Server-rendered web app, no local-first | Simplicity. No sync conflicts, no IndexedDB, no offline logic. If you have no internet, you're not triaging. |
| **Frontend** | Next.js (App Router) | Best ecosystem for fast productization on Vercel. Auth, API routes, edge middleware, SSR — all built in. |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first, dark mode built in, accessible components out of the box. |
| **Backend** | FastAPI | Brandon's strongest backend stack. Handles API logic, background jobs, and future growth. |
| **ORM** | SQLModel (SQLAlchemy + Pydantic) | Type-safe, familiar, minimal boilerplate. |
| **Database** | PostgreSQL (managed — Neon, Supabase, or Railway) | Battle-tested. Managed to avoid ops burden. |
| **Migrations** | Alembic | Standard for SQLAlchemy ecosystem. |
| **Auth** | NextAuth.js (Auth.js) or Clerk | Integrate at the Next.js layer. Email/password + OAuth (Google). |
| **Hosting** | Vercel (frontend) + Railway or Render (FastAPI backend) | One-click frontend deploys. Cheap, simple backend hosting. |
| **Mobile** | PWA only | No native apps. PWA push notifications work on iOS 16.4+. Revisit only if PWA proves insufficient. |
| **Collaboration** | Never. Single-player only. | Collaboration fundamentally changes the product. Tend is personal. |
| **Monetization** | Free with full features. Paid sync across devices: $3/mo or $25 lifetime. | Sync is the value gate. Core app is free to reduce friction. |
| **Desktop migration** | JSON export/import from Tauri app | Don't overthink it. One-time migration path. |
| **Triage scheduling** | On-demand for V1 | Timezone-aware prompts are P2. |

---

## 7. User Flows

### 7.1 Onboarding (First Visit — Day 1)

The onboarding is split across two sessions. Day 1 gets the user set up. Day 2 (the first morning triage) is where the real learning happens.

**Session 1: Signup and setup (~60 seconds)**

1. **Welcome screen** — "Tend helps you do fewer things, more honestly." One sentence. One illustration or icon. One "Get started" button. No feature tour.
2. **Domain setup** — "Choose your life areas." Five defaults pre-selected (Work, Personal, Health, Creative, Admin) with color dots. User can rename, recolor, remove, or accept defaults. Constraint shown naturally: 5 slots, no "add more" affordance.
3. **First tasks** — Dropped into empty Today view with a prompt: "What's on your plate? Add a few tasks to start." The input is focused automatically. No seed tasks — the user's own words are more motivating than examples.

**Session 2: First morning triage (Day 2)**

4. **First triage explainer** — Before the first triage card, show a one-time intro card (not a modal, not a tooltip — a card in the same style as triage cards):
   > "Every morning, Tend asks you to review your tasks. For each one, decide: do it today, push it to this week or later, or let it go. This takes about 2 minutes."
   >
   > [Start triaging →]
5. First triage card appears. Bucket buttons include inline descriptions for the first session only:
   - **Today** — "do it today"
   - **Soon** — "this week"
   - **Later** — "not now"
   - **Someday** — "be honest"
   - **Done** — "already handled"
   - **Kill** — "let it go"
6. After first triage completes, Today view loads with the honest nudge. First time only, the nudge includes a brief annotation: "(based on your last 30 days — this gets more accurate over time)"

After these two sessions, the user understands Tend. All remaining concepts (rewrite prompt, reaper, age badges) teach themselves at the moment they first appear.

### 7.2 Morning Triage (Core Loop)

1. User opens Tend
2. App detects pending tasks needing triage → shows triage view (blocks access to task list)
3. One card at a time: task text, age badge (bucket-relative), domain, defer count, sub-tasks
4. User chooses: **Today** / **Soon** / **Later** / **Someday** / **Done** / **Kill**
5. If defer count >= 3: rewrite prompt appears — user must edit task text before deferring
6. Progress indicator: "3 of 12 triaged"
7. After all tasks triaged → auto-transition to Today view
8. Honest nudge displayed: "8 tasks today — you usually complete about 5"

### 7.3 Working Through Today

1. Today view shows pending tasks, optionally filtered by domain
2. User taps/clicks a task to mark complete
3. Completed tasks move to a dimmed "Done" section below
4. User can add new tasks (defaults to Today bucket)
5. User can expand a task to see/add sub-tasks (one level only)
6. User can browse Soon/Later/Someday buckets from navigation

### 7.4 Evening Wind-Down (Optional)

1. User taps "Wind Down" button (available after 5 PM local time, or anytime manually)
2. Incomplete Today tasks presented for re-triage
3. Same card-based interface as morning triage
4. After wind-down: Today view is clean for tomorrow

### 7.5 Settings

1. Manage life domains (add/edit/delete, max 5 enforced)
2. Domain name + color
3. Account settings (email, password, delete account)
4. Data export (JSON)

---

## 8. Progressive Education

Tend does not have a help page, tutorial overlay, or feature tour. The app teaches itself through **contextual copy that appears at the moment of relevance** and disappears once the user has seen it. This is cheaper to build, more effective to learn from, and consistent with Tend's minimalism.

### First-Time States (shown once, then gone)

| Moment | What the user sees | Implementation |
|--------|-------------------|----------------|
| **First triage** | Intro card before first triage card: "Every morning, Tend asks you to review your tasks..." with [Start triaging →] button | One-time card, gated on `user.has_triaged_before` flag |
| **First triage buttons** | Inline descriptions on bucket buttons: "Today — do it today", "Soon — this week", etc. | Shown during first triage session only. Subsequent sessions show button labels only. |
| **First honest nudge** | Annotation below nudge: "(based on your last 30 days — this gets more accurate over time)" | Shown once on first Today view load with tasks. Hidden after first dismissal or next session. |
| **First domain setup** | Pre-selected defaults (Work, Personal, Health, Creative, Admin) with "Choose your life areas" header | Part of onboarding flow. |

### Self-Explaining Features (always contextual, no prior education needed)

| Feature | How it teaches itself |
|---------|---------------------|
| **Rewrite prompt** | The prompt IS the explanation: "This task has been deferred 3 times. Consider rewriting it — if it keeps getting pushed, it might be poorly framed." No prior warning needed. |
| **Age badges** | Appear only when meaningful (bucket-relative rules). The color escalation (gray → amber → red) is intuitive. No label needed. |
| **Reaper / auto-archive** | First time tasks are archived, show a one-time banner: "2 tasks were auto-archived — they'd been sitting for over 30 days. If something matters, it'll come back during triage." Link to archive. |
| **Wind-down** | Button label "Wind Down" + time-of-day context (shown after 5 PM or always available) is self-explanatory. |
| **Domain limit** | Error message at creation time: "Tend limits you to 5 domains to keep things intentional." The constraint teaches the philosophy. |

### Empty States

| Screen | Empty state copy |
|--------|-----------------|
| **Today (no tasks)** | "Nothing on your plate today. Add a task, or enjoy the quiet." |
| **Today (post-triage, all done)** | "All done. Nice work." |
| **Soon / Later / Someday (empty)** | "Nothing here. Tasks land here during triage." |
| **Triage (no tasks to triage)** | Skipped entirely — go straight to Today view. |
| **First visit (no tasks ever)** | "What's on your plate? Add a few tasks to start." (Input auto-focused) |

### What we do NOT build

- No "?" help icons
- No tooltip overlays on hover
- No "Learn more" links
- No feature tour or walkthrough carousel
- No in-app documentation page
- No onboarding email sequence (V1)

---

## 9. Error States & Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| **User hasn't opened app in 30+ days** | Reaper has archived stale tasks. On return, show a "Welcome back" message explaining what was archived. Link to archive view. Triage begins with any remaining pending tasks. |
| **User hasn't opened app in 60+ days** | Same as above. If all tasks are archived, skip triage and show empty Today view with prompt to add tasks. |
| **All tasks are in Today and none need triage** | Skip triage, go directly to Today view. |
| **User tries to add a 6th domain** | Show inline error: "Tend limits you to 5 domains to keep things intentional. Remove one to add another." Do not allow creation. |
| **User tries to add sub-task to a sub-task** | Disable the "add sub-task" action on sub-tasks. If attempted via API, return 422 with message: "Sub-tasks cannot have children." |
| **Task text is empty** | Prevent creation. Inline validation: "Tasks need text." |
| **Task text exceeds 500 characters** | Prevent creation. Inline validation: "Keep it short — under 500 characters." |
| **User tries to skip triage** | Block navigation to Today view. Only escape is completing triage or marking all as "Today" (a valid choice, just a lazy one). |
| **Rewrite prompt: user doesn't change text** | Allow them to proceed anyway. The prompt is a nudge, not a hard gate. Compare old vs. new text — if identical, show a gentle "Same text — are you sure?" confirmation. |
| **Completing a parent with incomplete sub-tasks** | Auto-complete all pending sub-tasks. Show brief confirmation: "Completed [parent] and 3 sub-tasks." |
| **Deleting a parent with sub-tasks** | Cascade delete all sub-tasks. Show confirmation dialog: "This will also delete 3 sub-tasks. Continue?" |
| **Network error during save** | Show toast: "Couldn't save — retrying..." Auto-retry 3 times with exponential backoff. If all fail: "Changes couldn't be saved. Check your connection." Do not lose the user's action — queue it. |
| **Concurrent edits (multi-device)** | Last-write-wins for V1. No conflict resolution. Acceptable risk at single-user scale. |

---

## 10. Feature Requirements

### 10.1 P0 — Must Have (MVP Launch)

#### Task Management
- Create tasks with text, bucket, and optional domain
- Complete tasks (with timestamp)
- Delete tasks (with confirmation for parents)
- Defer/move tasks between buckets (increments reschedule_count)
- Sub-tasks: one level deep, inherit parent's bucket/domain
- Completing parent auto-completes pending children
- Deleting parent cascades to children
- Task age badge with bucket-relative visibility (see Age Badge Rules)
- Task text max 500 characters

#### Age Badge Rules

The age badge shows how long a task has been on the list. It is **not always visible** — it only appears when the age is notable for the task's current context. This prevents noise and makes the badge meaningful when it does appear.

| Context | Show badge when | Color | Rationale |
|---------|----------------|-------|-----------|
| **Triage** (any card) | Always | Gray < 2w, Amber 2w+, Red 1mo+ | You need age to make a good triage decision. A 3-week-old task you're about to defer to Someday will be reaped in ~1 week — that's decision-relevant. |
| **Today** bucket | Age > 2 days | Gray 2d+, Amber 1w+, Red 2w+ | If a task has been in Today for more than a day, you didn't do it yesterday. That's worth knowing. |
| **Soon** bucket | Age > 7 days | Gray 7d+, Amber 2w+, Red 3w+ | "This week" that's been on the list for more than a week is a broken promise to yourself. |
| **Later** bucket | Age > 22 days | Amber 22d+, Red 27d+ | Age only matters here as a reaper proximity warning. Everything before 22 days is expected. |
| **Someday** bucket | Age > 22 days | Amber 22d+, Red 27d+ | Same as Later — the badge is a "reaper is coming" signal, not a guilt trip. |

**Format:** `Xd` (days), `Xw` (weeks), `Xmo` (months). Tasks < 1 day old show no badge in any context.

#### Triage
- Morning triage: card-based, one-at-a-time review of all pending tasks
- Actions: Today, Soon, Later, Someday, Done, Kill
- Rewrite prompt when defer count >= 3
- Progress indicator ("X of Y triaged")
- Triage blocks access to task list until complete
- Auto-transition to Today view on completion
- Evening wind-down triage for incomplete today tasks

#### ~~Honest Nudge~~ *(removed in PR #159)*
- ~~Track daily stats: tasks completed, tasks added~~
- ~~Calculate 30-day rolling average completion~~
- ~~Display nudge on Today view after triage: "X tasks today — you usually complete about Y"~~
- *Removed: numerical metrics created performance pressure rather than supporting intentional task management. Backend stats tracking retained for briefing service.*

#### Domains
- User-defined life domains (max 5, enforced)
- Domain name + color
- CRUD operations for domains
- Filter Today view by domain
- Domain selector on task creation
- Default domains on signup: Work, Personal, Health, Creative, Admin

#### Auto-Archive (Reaper)
- Archive pending tasks in non-Today buckets older than 30 days
- Archive children of archived parents
- Runs daily (cron job or on app load, whichever is simpler to implement first)
- "Welcome back" messaging when user returns after long absence

#### Authentication
- Email/password signup and login
- Google OAuth
- Session management
- Password reset flow
- Account deletion

#### Onboarding & Progressive Education
- 3-step signup flow: Welcome → Domain setup → First tasks (see Section 7.1)
- First-triage explainer card (one-time, before first triage card)
- First-triage bucket button descriptions ("Today — do it today", etc., first session only)
- First-time honest nudge annotation ("based on your last 30 days — gets more accurate over time")
- First-archive banner ("2 tasks were auto-archived after 30 days...")
- Empty state copy for all views (see Section 8: Progressive Education)
- `has_triaged_before` flag on user model to gate first-time states

#### UI/UX
- Dark theme (primary and only theme for V1)
- Responsive design: mobile-first, works on tablet and desktop
- Minimal, distraction-free interface
- Keyboard shortcuts for power users (desktop): Enter to complete, arrow keys in triage, etc.

### 10.2 P1 — Fast Follow

- Light theme + system preference toggle
- PWA: installable, offline queuing, push notifications for triage reminder
- Multi-device sync (comes free with server-side persistence + auth)
- Data import from Tauri desktop app (JSON)

### 10.3 P2 — Later

- Analytics dashboard: weekly/monthly trends, domain breakdown, streak tracking
- Configurable triage reminder time
- Data export (JSON, CSV)
- Keyboard-first mode (vim-style navigation)
- Public API + webhooks
- Archive browser with restore functionality

---

## 11. Data Model

### Tasks

| Field | Type | Constraints |
|-------|------|------------|
| id | UUID | PK, default: gen_random_uuid() |
| user_id | UUID | FK → users, NOT NULL, indexed |
| text | VARCHAR(500) | NOT NULL |
| bucket | ENUM(today, soon, later, someday) | NOT NULL |
| domain_id | UUID | FK → domains ON DELETE SET NULL, nullable |
| parent_id | UUID | FK → tasks ON DELETE CASCADE, nullable. Must be NULL if referenced task already has a parent_id (1-level depth enforced at app layer). |
| status | ENUM(pending, complete, archived) | NOT NULL, default: pending |
| reschedule_count | INTEGER | NOT NULL, default: 0 |
| triaged_at | DATE | nullable. Set to today's date when a triage action is taken. Used to track daily triage progress — `GET /triage` returns tasks where `triaged_at IS NULL OR triaged_at < today`. |
| created_at | TIMESTAMPTZ | NOT NULL, default: now() |
| updated_at | TIMESTAMPTZ | NOT NULL, default: now() |
| completed_at | TIMESTAMPTZ | nullable |

**Indexes:**
- `(user_id, status, bucket)` — primary query pattern for listing tasks
- `(user_id, parent_id)` — sub-task lookups
- `(user_id, status, created_at)` — reaper query (archive stale tasks)
- `(user_id, triaged_at)` — triage query (find untriaged tasks)

### Domains

| Field | Type | Constraints |
|-------|------|------------|
| id | UUID | PK, default: gen_random_uuid() |
| user_id | UUID | FK → users, NOT NULL, indexed |
| name | VARCHAR(50) | NOT NULL |
| color | VARCHAR(7) | NOT NULL, hex code (e.g., #3B82F6) |
| position | INTEGER | NOT NULL, display order |

**Constraints:**
- Max 5 domains per user (enforced at app layer + DB check constraint via trigger or partial index)
- Unique on `(user_id, name)` — no duplicate domain names per user

### Daily Stats

| Field | Type | Constraints |
|-------|------|------------|
| user_id | UUID | FK → users, NOT NULL |
| date | DATE | NOT NULL |
| tasks_completed | INTEGER | NOT NULL, default: 0 |
| tasks_added | INTEGER | NOT NULL, default: 0 |

**Constraints:**
- PK on `(user_id, date)` — composite primary key, no separate id needed

### Users

| Field | Type | Constraints |
|-------|------|------------|
| id | UUID | PK, default: gen_random_uuid() |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | nullable (OAuth-only users) |
| auth_provider | ENUM(email, google) | NOT NULL |
| has_completed_onboarding | BOOLEAN | NOT NULL, default: false. Set to true after completing (or skipping) the 3-step onboarding flow. Gates onboarding redirect. |
| has_triaged_before | BOOLEAN | NOT NULL, default: false. Set to true after first triage completion. Gates first-time education states. |
| created_at | TIMESTAMPTZ | NOT NULL, default: now() |

---

## 12. API Contracts

All endpoints are served by the FastAPI backend. Authentication is handled at the Next.js layer (NextAuth/Clerk); the FastAPI backend receives a verified `user_id` via a **signed JWT** from the Next.js API proxy. The JWT is signed with a shared secret and contains the user_id + expiry. Plain headers (e.g., X-User-Id) must NOT be used — they are trivially forgeable by any client bypassing the proxy.

**Base URL:** `{BACKEND_URL}/api/v1`

**Common conventions:**
- All responses use JSON
- All timestamps are ISO 8601 with timezone (e.g., `2026-02-06T08:30:00Z`)
- UUIDs are string-formatted (e.g., `"a1b2c3d4-..."`)
- Errors follow a consistent shape (see Error Responses below)
- All endpoints require authentication unless noted

### Error Response Shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": {}
  }
}
```

| HTTP Status | Code | When |
|-------------|------|------|
| 400 | `BAD_REQUEST` | Malformed input |
| 401 | `UNAUTHORIZED` | Missing or invalid auth |
| 403 | `FORBIDDEN` | Valid auth but not your resource |
| 404 | `NOT_FOUND` | Resource doesn't exist |
| 409 | `CONFLICT` | Duplicate (e.g., domain name) |
| 422 | `VALIDATION_ERROR` | Business rule violation (e.g., nesting depth, domain limit) |
| 500 | `INTERNAL_ERROR` | Server error |

---

### 12.1 Triage

#### `GET /triage`

Returns all pending top-level tasks that need triage. The frontend uses this to drive the card-by-card triage flow.

**Triage logic:** A user needs triage if they have any pending top-level tasks where `triaged_at IS NULL OR triaged_at < today`. On a fresh day, all pending top-level tasks need triage. Once all tasks have been triaged (empty result), `triage_complete: true` and the frontend unlocks the Today view. Tasks added mid-day (after triage) don't trigger re-triage until the next morning.

**Response: `200 OK`**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "text": "Review Q1 budget",
      "bucket": "soon",
      "domain": { "id": "uuid", "name": "Work", "color": "#3B82F6" },
      "status": "pending",
      "reschedule_count": 2,
      "created_at": "2026-01-15T10:00:00Z",
      "updated_at": "2026-02-05T08:00:00Z",
      "subtask_count": 3,
      "subtask_completed_count": 1
    }
  ],
  "total": 12,
  "completion_average": 5.2,
  "triage_complete": false
}
```

**Ordering:** Tasks are returned in `created_at ASC` order (oldest first).

#### `POST /triage/{task_id}`

Apply a triage action to a single task. Every action sets `triaged_at = today` on the task.

**Request:**
```json
{
  "action": "confirm",
  "updated_text": "Review Q1 budget with Sarah"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | enum: `confirm`, `defer`, `complete`, `kill` | yes | See action semantics below |
| `bucket` | enum: `today`, `soon`, `later`, `someday` | if action=defer | Target bucket |
| `updated_text` | string (1-500 chars) | no | New task text if user rewrites during triage |

**Action semantics:**
- **`confirm`**: Task stays in current bucket (or moves to today if not already). No reschedule_count increment. Use for "yes, this is for today" or "I've reviewed this."
- **`defer`**: Moves task to specified bucket. Increments reschedule_count. Cascades bucket change to children.
- **`complete`**: Marks task (and pending children) as complete. Updates daily stats.
- **`kill`**: **Permanently deletes** the task (and children). Kill ≠ archive. Archive is the reaper's domain.

**Response: `200 OK`**
```json
{
  "task": { /* updated task object, or null if killed */ },
  "remaining": 11,
  "triage_complete": false,
  "same_text_warning": false
}
```

`same_text_warning: true` is returned when `updated_text` was provided but is identical to the current text. The frontend should show a "Same text — are you sure?" confirmation before resubmitting.

**Errors:**
- `404` — Task not found or not owned by user
- `422` — Invalid action/bucket combination (e.g., defer without bucket)

#### `GET /triage/winddown`

Returns incomplete Today tasks for evening re-triage.

**Response: `200 OK`**
```json
{
  "tasks": [ /* same shape as GET /triage */ ],
  "total": 5
}
```

---

### 12.2 Tasks

#### `GET /tasks`

List tasks for the authenticated user. Supports filtering by bucket, status, and domain.

**Query Parameters:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `bucket` | enum | — | Filter by bucket |
| `status` | enum | `pending` | Filter by status |
| `domain_id` | UUID | — | Filter by domain |
| `include_subtasks` | bool | `false` | Nest sub-tasks under parents in response |

**Response: `200 OK`**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "text": "Ship landing page",
      "bucket": "today",
      "domain": { "id": "uuid", "name": "Work", "color": "#3B82F6" },
      "parent_id": null,
      "status": "pending",
      "reschedule_count": 0,
      "created_at": "2026-02-06T08:00:00Z",
      "updated_at": "2026-02-06T08:00:00Z",
      "completed_at": null,
      "subtasks": [
        {
          "id": "uuid",
          "text": "Write hero copy",
          "status": "complete",
          "completed_at": "2026-02-06T09:30:00Z"
        },
        {
          "id": "uuid",
          "text": "Add OG image",
          "status": "pending",
          "completed_at": null
        }
      ]
    }
  ]
}
```

*Note: `subtasks` array is only present when `include_subtasks=true`. Sub-tasks are a flat array (never nested further).*

#### `POST /tasks`

Create a new task.

**Request:**
```json
{
  "text": "Buy groceries",
  "bucket": "today",
  "domain_id": "uuid-or-null",
  "parent_id": "uuid-or-null"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `text` | string | yes | 1–500 characters |
| `bucket` | enum | yes | today, soon, later, someday |
| `domain_id` | UUID | no | Must reference user's own domain |
| `parent_id` | UUID | no | Must reference user's own task. Target task must not itself be a sub-task. |

**Response: `201 Created`**
```json
{
  "task": { /* full task object */ }
}
```

**Errors:**
- `422 VALIDATION_ERROR` — text empty/too long, invalid bucket, parent is already a sub-task ("Sub-tasks cannot have children."), parent_id not found
- `404` — Referenced domain_id not found

**Side effects:**
- Increments today's `daily_stats.tasks_added` by 1
- If `parent_id` is set, inherits parent's `bucket` and `domain_id` (request values for these are ignored)

#### `PATCH /tasks/{task_id}`

Update a task's text, bucket, or domain.

**Request (partial update — all fields optional):**
```json
{
  "text": "Buy groceries for the week",
  "bucket": "soon",
  "domain_id": "uuid-or-null"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `text` | string | 1–500 characters |
| `bucket` | enum | Changing bucket does NOT increment reschedule_count (that's triage-only) |
| `domain_id` | UUID or null | Set to null to remove domain |

**Response: `200 OK`**
```json
{
  "task": { /* updated task object */ }
}
```

**Side effects:**
- If bucket changes on a parent task, all pending sub-tasks move to the same bucket
- `updated_at` is set to now()

#### `POST /tasks/{task_id}/complete`

Mark a task as complete.

**Request:** *(empty body)*

**Response: `200 OK`**
```json
{
  "task": { /* updated task with status=complete, completed_at set */ },
  "completed_subtasks": 2
}
```

**Side effects:**
- Sets `status` to `complete` and `completed_at` to now()
- If task has pending sub-tasks, auto-completes them all
- Increments today's `daily_stats.tasks_completed` by 1 (parent only — sub-tasks don't count toward stats)

#### `DELETE /tasks/{task_id}`

Delete a task permanently.

**Response: `200 OK`**
```json
{
  "deleted_id": "uuid",
  "deleted_subtask_count": 3
}
```

**Side effects:**
- Cascades to all sub-tasks (DB-level ON DELETE CASCADE)

---

### 12.3 Domains

#### `GET /domains`

List all domains for the authenticated user, ordered by `position`.

**Response: `200 OK`**
```json
{
  "domains": [
    { "id": "uuid", "name": "Work", "color": "#3B82F6", "position": 0 },
    { "id": "uuid", "name": "Personal", "color": "#10B981", "position": 1 },
    { "id": "uuid", "name": "Health", "color": "#F59E0B", "position": 2 }
  ]
}
```

#### `POST /domains`

Create a new domain.

**Request:**
```json
{
  "name": "Creative",
  "color": "#8B5CF6"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | yes | 1–50 characters, unique per user |
| `color` | string | yes | Valid hex color (e.g., `#3B82F6`) |

**Response: `201 Created`**
```json
{
  "domain": { "id": "uuid", "name": "Creative", "color": "#8B5CF6", "position": 3 }
}
```

**Errors:**
- `422 VALIDATION_ERROR` — User already has 5 domains: "Tend limits you to 5 domains to keep things intentional. Remove one to add another."
- `409 CONFLICT` — Domain name already exists for this user

**Side effects:**
- `position` is auto-assigned as max(position) + 1

#### `PATCH /domains/{domain_id}`

Update a domain's name or color.

**Request (partial):**
```json
{
  "name": "Side Projects",
  "color": "#EC4899"
}
```

**Response: `200 OK`**
```json
{
  "domain": { /* updated domain object */ }
}
```

#### `DELETE /domains/{domain_id}`

Delete a domain. Tasks in this domain have their `domain_id` set to NULL.

**Response: `200 OK`**
```json
{
  "deleted_id": "uuid",
  "affected_task_count": 7
}
```

#### `PATCH /domains/reorder`

Update display order for all domains.

**Request:**
```json
{
  "order": ["uuid-1", "uuid-3", "uuid-2", "uuid-4"]
}
```

**Response: `200 OK`**
```json
{
  "domains": [ /* all domains in new order */ ]
}
```

**Errors:**
- `422` — List doesn't contain all domain IDs for the user, or contains unknown IDs

---

### 12.4 Stats

#### `GET /stats/nudge`

Returns the data needed for the honest nudge display.

**Response: `200 OK`**
```json
{
  "today_task_count": 8,
  "avg_daily_completed": 5.2,
  "avg_period_days": 30
}
```

*`avg_daily_completed` is the mean of `tasks_completed` over the last 30 days of activity (days with at least one stat entry). Returns 0 if no history.*

#### `GET /stats/daily`

Returns daily stats for a date range. Used for the analytics dashboard (P2).

**Query Parameters:**

| Param | Type | Default |
|-------|------|---------|
| `from` | date (YYYY-MM-DD) | 30 days ago |
| `to` | date (YYYY-MM-DD) | today |

**Response: `200 OK`**
```json
{
  "stats": [
    { "date": "2026-02-05", "tasks_completed": 6, "tasks_added": 2 },
    { "date": "2026-02-06", "tasks_completed": 3, "tasks_added": 4 }
  ]
}
```

---

### 12.5 Reaper

#### `POST /reaper/run`

Manually trigger the reaper. Also runs automatically via a daily cron job.

**Response: `200 OK`**
```json
{
  "archived_count": 4,
  "archived_tasks": [
    { "id": "uuid", "text": "Old thing I forgot about", "bucket": "someday", "age_days": 45 }
  ]
}
```

**Logic:**
1. Find all pending top-level tasks in `soon`, `later`, `someday` buckets where `created_at` < 30 days ago
2. Set `status` to `archived` on those tasks
3. Set `status` to `archived` on any pending children of newly-archived parents

---

### 12.6 Account

#### `GET /me`

Returns the authenticated user's profile.

**Response: `200 OK`**
```json
{
  "id": "uuid",
  "email": "brandon@example.com",
  "auth_provider": "email",
  "created_at": "2026-01-01T00:00:00Z"
}
```

#### `DELETE /me`

Delete the user's account and all associated data (tasks, domains, stats). Requires confirmation.

**Request:**
```json
{
  "confirm": "DELETE"
}
```

**Response: `200 OK`**
```json
{
  "deleted": true
}
```

**Side effects:**
- Cascades deletion of all user data (tasks, domains, stats)
- Invalidates all sessions

#### `POST /import`

Import tasks and domains from a JSON export (Tauri desktop app migration).

**Request:**
```json
{
  "tasks": [
    {
      "text": "Imported task",
      "bucket": "today",
      "status": "pending",
      "reschedule_count": 1,
      "domain_name": "Work",
      "subtasks": [
        { "text": "Imported sub-task", "status": "pending" }
      ]
    }
  ],
  "domains": [
    { "name": "Work", "color": "#3B82F6" },
    { "name": "Personal", "color": "#10B981" }
  ]
}
```

**Response: `200 OK`**
```json
{
  "imported_tasks": 24,
  "imported_domains": 3,
  "skipped_domains": 0
}
```

**Logic:**
- Domains are matched by name; existing domains are reused, new ones are created (respecting max 5 limit)
- Tasks are created with their original status and reschedule_count
- Sub-tasks are nested under their parents
- `domain_name` on tasks is resolved to the matching domain_id

### 12.7 State (Agent Context)

`GET /api/v1/state`

Returns a unified snapshot of everything an agent (or any client) needs to understand the user's current state. Designed as agent "working memory" — one call replaces multiple queries.

**Response:**
```json
{
  "user": {
    "has_triaged_before": true,
    "created_at": "2026-01-15T..."
  },
  "triage": {
    "pending_count": 12,
    "triaged_today": false
  },
  "today": {
    "tasks": 8,
    "completed": 3,
    "completion_average": 5.2
  },
  "buckets": {
    "soon": 14,
    "later": 22,
    "someday": 9
  },
  "domains": [
    { "id": "...", "name": "Work", "color": "#3B82F6", "task_count": 18 },
    { "id": "...", "name": "Health", "color": "#10B981", "task_count": 7 }
  ],
  "reaper": {
    "at_risk_count": 3,
    "next_run": "2026-02-07T04:00:00Z"
  }
}
```

**Notes:**
- Lightweight aggregation — no task bodies, just counts and metadata
- Designed for agents but useful for dashboard UIs too
- Not in P0 scope (see Section 17.4 Domain Tools Ladder) — add when agent integration begins

---

## 13. Technical Architecture

### Stack (Decided)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), React, TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Backend API | FastAPI (Python 3.12+) |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Database | PostgreSQL (managed: Neon, Supabase, or Railway) |
| Migrations | Alembic |
| Auth | NextAuth.js or Clerk (at Next.js layer) |
| Frontend hosting | Vercel |
| Backend hosting | Railway or Render |
| Monitoring | Sentry (basic error tracking) |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                      Client                         │
│              (Browser / PWA shell)                   │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────┐
│                 Next.js on Vercel                    │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │ App Router   │  │ Auth       │  │ API Proxy    │ │
│  │ (SSR/RSC)   │  │ (NextAuth) │  │ /api/* → BE  │ │
│  └─────────────┘  └────────────┘  └──────┬───────┘ │
└──────────────────────────────────────────┼──────────┘
                                           │ HTTPS + Bearer Token
┌──────────────────────────────────────────▼──────────┐
│              FastAPI on Railway/Render               │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ API      │  │ Services  │  │ Reaper (cron)    │ │
│  │ Routes   │  │ (logic)   │  │ (daily archive)  │ │
│  └────┬─────┘  └─────┬─────┘  └────────┬─────────┘ │
│       └───────────────┼─────────────────┘           │
└───────────────────────┼─────────────────────────────┘
                        │ SQLModel
┌───────────────────────▼─────────────────────────────┐
│               PostgreSQL (Managed)                   │
│         tasks | domains | daily_stats | users        │
└─────────────────────────────────────────────────────┘
```

### Auth Flow

1. User logs in via NextAuth.js (email/password or Google OAuth) on the Next.js frontend
2. NextAuth manages sessions (JWT or database sessions)
3. Next.js API proxy routes (`/api/*`) forward requests to FastAPI with a verified `user_id` in an `X-User-Id` header (or a signed JWT the FastAPI backend validates)
4. FastAPI extracts `user_id` from the header/token via a dependency and scopes all queries to that user

### Architecture Principles

1. **Server-first.** All data lives in Postgres. No local storage, no IndexedDB, no sync logic.
2. **Fast.** Sub-200ms API responses. Optimistic UI updates where safe (completing a task, adding a task).
3. **Simple deployment.** Monorepo with clear separation: `frontend/` (Next.js) and `backend/` (FastAPI).
4. **API-driven.** Frontend talks to FastAPI over REST. Next.js API routes proxy to FastAPI or handle auth only.

---

## 14. Design Principles

1. **Constraint is kindness.** Every limit exists to protect the user from themselves.
2. **Ritual over features.** The triage flow is the product. Everything else supports it.
3. **Honesty over motivation.** No streaks, no gamification, no "you're doing great!" — just data.
4. **Dark by default.** Tend is a tool, not a destination. Quiet room, not carnival.
5. **Mobile-first, keyboard-friendly.** Primary use case is morning triage on a phone. Power users on desktop should never need the mouse.

---

## 15. Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Daily triage completion rate | > 70% of active users | Core habit is forming |
| Tasks completed / tasks claimed | Trending toward 1:1 | Nudge is working |
| 7-day retention | > 40% | App is sticky |
| Average session duration | < 5 minutes | App is efficient, not addictive |
| Tasks auto-archived per user/month | Declining over time | Users are getting more intentional |

---

## 16. What Tend Is NOT

- **Not a project manager.** No milestones, dependencies, Gantt charts, or team features.
- **Not a note-taking app.** Tasks are short text, not documents.
- **Not a calendar.** No time-blocking, scheduling, or due dates.
- **Not a gamified habit tracker.** No points, streaks, or achievements.
- **Not collaborative.** Ever. This is a single-player product.
- **Not trying to be everything.** Tend does one thing: help you consciously decide what matters today.

---

## 17. Agent-Native Architecture

Tend is built for a future where an AI agent is a first-class user of the app — not a chatbot bolted on later. This section documents design principles that ensure agent integration never requires a rewrite.

**Core principle:** The API is the product. The UI is one client. An agent is another.

### 17.1 Five Principles (Applied to Tend)

| Principle | What It Means for Tend | Litmus Test |
|-----------|----------------------|-------------|
| **Parity** | Every action a user takes in the UI maps to an API call. No "orphan UI actions" that only work through the frontend. | Pick any button in the app. Can an agent call an API to do the same thing? |
| **Granularity** | API endpoints are atomic primitives — each does ONE thing. Decision logic ("should I move this to Today or Soon?") belongs in the agent's prompt, not in the API. | Is the decision being made by the caller, or baked into the endpoint? |
| **Composability** | New workflows emerge by combining existing endpoints. "Evening review", "weekly planning", or "batch triage" don't require new API endpoints. | Can I create this workflow using only existing endpoints? |
| **Queryability** | Every visible UI state has a corresponding GET endpoint. The agent can always know what the user would see. | Is there anything visible on screen that the agent can't query? |
| **Structured Errors** | All errors return machine-readable codes and context, not just human-readable messages. | Can an agent programmatically decide what to do with this error? |

### 17.2 What This Means for V1

These are **not** future requirements — they're constraints on how we build V1:

1. **All business logic in `services/`**. Route handlers validate input and call services. No business rules in route handlers, no business rules in the frontend. This means an agent calling the API gets identical behavior to a user clicking a button.

2. **API responses include context**. The triage endpoint doesn't just return a task — it returns the completion average, the task count, the triage progress. This is the agent's "peripheral vision."

3. **Triage is stateless**. Each triage decision (`POST /triage/{task_id}`) is independent. There's no server-side "triage session" to start or end. An agent can triage tasks in any order, skip some, or stop partway through.

4. **Atomic endpoints, no bundles**. `PATCH /tasks/{id}` changes fields. `POST /tasks/{id}/complete` marks complete. `POST /triage/{id}` moves to a bucket. Each does one thing. The agent (or UI) composes these — the API never decides "and also do X while you're at it."

### 17.3 Approval Matrix

When an agent acts on a user's behalf, stakes and reversibility determine autonomy:

| Action | Stakes | Reversibility | Agent Behavior |
|--------|--------|---------------|----------------|
| Move task to bucket | Low | Easy (move again) | Auto-apply |
| Add new task | Low | Easy (delete it) | Auto-apply |
| Mark task complete | Low | Easy (uncomplete) | Auto-apply |
| Kill / archive task | Medium | Moderate (restore from archive) | Suggest, then apply |
| Rewrite task text | Medium | Hard (original lost) | Suggest, get approval |
| Delete domain | High | Hard (tasks orphaned) | Explicit approval |
| Bulk operations | Varies | Hard (many changes at once) | Always explicit approval |

### 17.4 Domain Tools Ladder

How the API evolves to support agents, in order:

1. **Start with primitives (V1)** — Tasks CRUD, Domains CRUD, Triage move, Stats query. These are the atoms.
2. **Add a state endpoint** — `GET /api/v1/state` returns the full context an agent needs: untriaged count, today's tasks, completion average, domain list, reaper warnings. This is the agent's "working memory" (Context.md pattern).
3. **Observe patterns** — What does the agent do repeatedly? If it always fetches stats before triage, consider a combined response. But only after observing the pattern — not before.
4. **Add convenience tools** — Only for proven repeated patterns. Keep primitives accessible for edge cases.

### 17.5 Future: MCP Integration (Not V1)

When Tend adds agent support, each API endpoint becomes an MCP tool:

| MCP Tool | Maps To | Description |
|----------|---------|-------------|
| `tend_get_state` | `GET /state` | What does my day look like? |
| `tend_triage` | `POST /triage/{id}` | Move a task to a bucket |
| `tend_add_task` | `POST /tasks` | Create a task in a bucket |
| `tend_complete` | `POST /tasks/{id}/complete` | Mark done |
| `tend_get_tasks` | `GET /tasks?bucket=X` | List tasks by bucket |
| `tend_get_nudge` | `GET /stats/nudge` | How honest should I be? |

A conversational agent layer composes these tools to handle natural language: "Move everything in Soon that's older than a week to Later" becomes a loop of `tend_get_tasks` + filter + `tend_triage` calls.

### 17.6 Anti-Patterns to Avoid

| Anti-Pattern | What It Looks Like | Why It's Harmful |
|--------------|-------------------|-----------------|
| **Agent as router** | One `POST /agent` endpoint that classifies intent and calls internal functions | The agent can't compose; all intelligence is in your code, not the prompt |
| **Bundled endpoints** | `POST /triage/{id}` that also checks defer count, triggers rewrite prompt, and updates stats | Decision logic is trapped in the API; agent can't customize the workflow |
| **Request/response thinking** | Designing for single-shot interactions | Agents work in loops — triage is 12 iterations of the same endpoint, not one call |
| **Orphan UI actions** | "Wind Down" button that calls 3 endpoints internally but has no single API | Agent can replicate it, but has to reverse-engineer the sequence |
| **Over-constrained tools** | Validation that rejects unusual but valid requests | Prevents emergent capability — the agent might find useful patterns you didn't anticipate |

---

## 18. Milestones

### M1: Core Web App (MVP)
- Auth (email/password + Google OAuth)
- Task CRUD with buckets and domains
- Morning and evening triage flows
- Honest nudge with 30-day stats
- Auto-archive reaper
- Dark theme, responsive design
- Deploy to Vercel + Railway/Render

### M2: PWA & Polish
- Installable PWA with offline queuing
- Light theme + system preference
- Onboarding walkthrough
- Keyboard shortcuts
- Morning triage push notification

### M3: Monetization & Growth
- Stripe integration for paid sync tier ($3/mo or $25 lifetime)
- Analytics dashboard
- Data export/import
- Desktop app migration tool (JSON import)

### M4: Power Features
- Keyboard-first mode
- Public API + webhooks
- Archive browser with restore
- Configurable reminder times

### M5: Agent Integration
- `GET /api/v1/state` endpoint (agent working memory)
- MCP tool wrappers for all API endpoints
- Approval matrix enforcement (auto-apply vs. confirm vs. explicit)
- Conversational agent layer (natural language → tool composition)
- Latent demand logging (track what agents attempt but can't do → tool gaps to fill)

---

## 19. Agent Instructions

This section governs how AI agents (Larry / Claude Code) should work on Tend.

### Coding Conventions
- **Frontend:** TypeScript strict mode. Functional components only. Use React Server Components where possible (Next.js App Router default). Client components only when necessary (interactivity, hooks).
- **Backend:** Python 3.12+. Type hints on all functions. Pydantic models for all request/response schemas. SQLModel for database models.
- **Naming:** snake_case for Python, camelCase for TypeScript. PascalCase for React components and Python classes.
- **Formatting:** Prettier (frontend), Ruff (backend). No exceptions.
- **Tests:** Every API endpoint must have at least one happy-path test and one error-case test (pytest). Frontend: test triage flow and task CRUD with Playwright or React Testing Library.

### File Structure

```
tend-web/
├── frontend/                # Next.js app
│   ├── app/                 # App Router pages and layouts
│   │   ├── (auth)/          # Auth pages (login, signup)
│   │   ├── (app)/           # Authenticated app pages
│   │   │   ├── triage/      # Triage view
│   │   │   ├── today/       # Today view (default)
│   │   │   ├── bucket/[b]/  # Soon/Later/Someday views
│   │   │   └── settings/    # Settings page
│   │   ├── api/             # Next.js API routes (auth + proxy)
│   │   └── layout.tsx       # Root layout
│   ├── components/          # Shared UI components
│   │   ├── ui/              # shadcn/ui primitives
│   │   ├── task-card.tsx    # Triage card component
│   │   ├── task-item.tsx    # Task list item
│   │   ├── task-input.tsx   # Task creation form
│   │   └── domain-badge.tsx # Domain color indicator
│   ├── lib/                 # Utilities
│   │   ├── api.ts           # Typed API client (fetch wrapper)
│   │   ├── types.ts         # Shared TypeScript types
│   │   └── utils.ts         # Helpers (age formatting, etc.)
│   └── public/              # Static assets, PWA manifest
├── backend/                 # FastAPI app
│   ├── app/
│   │   ├── main.py          # FastAPI app entry
│   │   ├── api/             # Route handlers
│   │   │   ├── tasks.py
│   │   │   ├── triage.py
│   │   │   ├── domains.py
│   │   │   ├── stats.py
│   │   │   └── account.py
│   │   ├── models/          # SQLModel table models
│   │   │   ├── task.py
│   │   │   ├── domain.py
│   │   │   ├── daily_stat.py
│   │   │   └── user.py
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── services/        # Business logic
│   │   │   ├── task_service.py
│   │   │   ├── triage_service.py
│   │   │   ├── domain_service.py
│   │   │   └── reaper_service.py
│   │   └── core/            # Config, dependencies, auth
│   │       ├── config.py
│   │       ├── deps.py      # get_current_user, get_db
│   │       └── security.py
│   ├── alembic/             # Database migrations
│   │   └── versions/
│   └── tests/
│       ├── test_tasks.py
│       ├── test_triage.py
│       ├── test_domains.py
│       └── conftest.py      # Fixtures (test DB, auth mock)
├── docs/
│   └── PRD.md               # This document
└── README.md
```

### Issue Format
Every GitHub issue must include:
- **Title:** Short, imperative ("Add triage progress indicator", not "Triage progress indicator feature")
- **Description:** What and why (1-2 paragraphs max)
- **Acceptance criteria:** Given/When/Then format
- **Scope:** List what's in and out of scope for this issue
- **Labels:** `p0`, `p1`, `p2` for priority; `frontend`, `backend`, `fullstack` for area

### PR Format
- Title matches the issue title
- Description links to the issue
- All acceptance criteria are met
- Tests pass
- No unrelated changes

### What Agents Must NOT Do
- Add features not in this PRD
- Change the data model without explicit approval
- Add new dependencies without justification in the PR description
- Skip tests
- Make UI decisions that contradict the design principles (no gamification, no feature bloat, no bright colors)

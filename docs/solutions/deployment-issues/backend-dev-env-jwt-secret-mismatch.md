# Backend Dev Environment: JWT Secret Mismatch Causes 401 Render Loop

## The Pattern

The Next.js proxy signs short-lived JWTs with `INTERNAL_JWT_SECRET` from `frontend/.env.local`.
The FastAPI backend verifies those JWTs with `internal_jwt_secret` from `backend/.env` (defaults to `"change-me"` when no `.env` file exists).

When they don't match, **every authenticated API call returns 401**. The api.ts request function handles 401 like this:

```ts
if (res.status === 401 && typeof window !== "undefined") {
  window.location.href = "/login";
  return new Promise(() => {}) as T;
}
```

This navigates to `/login`, which NextAuth immediately redirects back to the app (user has a valid session), which triggers more API calls, which all 401 again → loop.

## The Symptom

Looks identical to the React render loop caused by duplicate array keys:
- Browser flashes / full page reloads
- `[HMR] connected` appears repeatedly in DevTools console
- DevTools can't be opened fast enough to capture logs
- App appears to load briefly, then reloads

The difference: check the Network tab. If you see repeated requests to `/api/me` or `/api/tasks` each returning 401, it's the JWT mismatch. If the network looks quiet but the page still flashes, it's a React key/effect issue.

## The Fix

Create `backend/.env` with the correct secret:

```
DATABASE_URL=postgresql://brandon@localhost:5432/tend_dev
INTERNAL_JWT_SECRET=dev-only-change-in-production
```

Then restart both the backend process and the Next.js dev server (env changes require a restart on both sides).

## Why This Happens

The backend's `config.py` uses pydantic-settings with `env_file = ".env"`. If no `.env` file exists in the working directory, it falls back to the hardcoded default `"change-me"`. The frontend's `INTERNAL_JWT_SECRET=dev-only-change-in-production` in `.env.local` doesn't match, so all JWT verification fails.

The backend `.env` file is gitignored (contains secrets) — so it must be recreated whenever working on a fresh checkout or in a new shell that started the backend from scratch.

## Prevention

In Railway production, `INTERNAL_JWT_SECRET` is a Shared Variable referenced by both services, so this can't happen there. The risk is only local dev.

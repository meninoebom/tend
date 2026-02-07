---
title: "Railway Two-Service Deployment with Managed Postgres"
category: deployment-issues
tags: [railway, fastapi, nextjs, postgresql, deployment, nixpacks, nextauth]
module: Infrastructure
symptom: "Various deployment failures: DATABASE_URL not set, SQLAlchemy URL parse error, Node.js version mismatch, NextAuth UntrustedHost/MissingSecret, frontend proxy 500 errors"
root_cause: "Multiple Railway-specific configuration requirements that aren't obvious from documentation"
date: 2026-02-06
---

# Railway Two-Service Deployment with Managed Postgres

## Context

Deploying Tend (Next.js frontend + FastAPI backend + PostgreSQL) to Railway as a single project with three services. This documents every issue encountered and the fix.

## Issues and Solutions

### 1. Services in separate projects — variable references don't resolve

**Symptom:** `DATABASE_URL` env var contains the literal string `${{tend-db.DATABASE_URL}}` instead of the actual connection string.

**Root cause:** Services were created in separate Railway projects. Variable references (`${{ServiceName.VAR}}`) only resolve between services in the **same project**.

**Fix:** Move all services (backend, frontend, database) into one Railway project.

### 2. postgres:// URL scheme breaks SQLAlchemy

**Symptom:** `Could not parse SQLAlchemy URL from string` on startup.

**Root cause:** Railway Postgres provides `postgres://` connection strings. SQLAlchemy/SQLModel requires `postgresql://`.

**Fix:** Added a `model_validator` in `backend/app/core/config.py`:
```python
@model_validator(mode="after")
def fix_database_url(self) -> "Settings":
    if self.database_url.startswith("postgres://"):
        self.database_url = self.database_url.replace("postgres://", "postgresql://", 1)
    return self
```

### 3. Procfile YAML parsing error

**Symptom:** `mapping values are not allowed in this context at line 1 column 91` during build.

**Root cause:** Python f-strings with colons in Procfile values confuse Railway's YAML parser.

**Fix:** Move complex startup logic to `start.py` and keep Procfile minimal:
```
web: python start.py
```

### 4. Node.js version too old for Next.js

**Symptom:** `Node.js version ">=20.9.0" is required` build error.

**Root cause:** Railway Nixpacks defaults to Node 18. Next.js 16 requires Node >= 20.9.0.

**Fix:** Created `frontend/.node-version` with content `20`.

### 5. NextAuth UntrustedHost error

**Symptom:** `UntrustedHost` error, URL was `http://healthcheck.railway.app`.

**Root cause:** Railway health checks come from a different host. NextAuth v5 rejects untrusted hosts by default (Vercel is auto-trusted).

**Fix:** Set env var `AUTH_TRUST_HOST=true` on the frontend service.

### 6. NextAuth MissingSecret error

**Symptom:** `MissingSecret` error on page load.

**Root cause:** NextAuth auto-detects secrets on Vercel but requires explicit configuration elsewhere.

**Fix:** Set env var `NEXTAUTH_SECRET` to a random 32+ character string.

### 7. Frontend proxy 500 errors — missing shared secret

**Symptom:** `/api/domains` and `/api/me` returning 500. Debug endpoint showed `internal_jwt_secret_set: false`.

**Root cause:** The `INTERNAL_JWT_SECRET` shared variable wasn't properly configured to reach the frontend service.

**Fix:** Configured `INTERNAL_JWT_SECRET` as a Railway Shared Variable accessible by both services. Created a `/api/debug` endpoint to diagnose env var issues remotely.

### 8. BACKEND_URL with space in hostname

**Symptom:** `Failed to parse URL from tend backend.railway.internal/users`

**Root cause:** The BACKEND_URL had a space in it (Railway display name vs actual hostname).

**Fix:** Use the actual public URL (e.g., `https://tend-backend-production.up.railway.app`) or the correct internal hostname.

## Key Takeaways

1. **Same project is critical** — all services must be in one Railway project for variable references to work
2. **Always normalize postgres:// URLs** when using Railway Postgres with SQLAlchemy
3. **Use a startup script** (`start.py`) instead of complex Procfile commands
4. **Create a debug endpoint** for remote env var diagnosis (remove before production)
5. **NextAuth on non-Vercel** needs `AUTH_TRUST_HOST=true` and explicit `NEXTAUTH_SECRET`
6. **Set `.node-version`** explicitly for Node.js services
7. **Shared Variables** are the right pattern for secrets needed by multiple services

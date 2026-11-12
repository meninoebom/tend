# Tend CLI + Unified Auth — Architecture Plan

**Status:** Architecture locked. Command-surface details deferred to a follow-up.
**Date:** 2026-08-20 (revised 2026-09-01 after adopting Logto)
**Goal:** A `tend` CLI so agents (Claude Code) and Brandon can drive Tend from a shell, using one login shared by the web app and the CLI — the Anthropic `/login` model — on a well-worn, supported path.

---

## 1. Decisions locked

| Decision | Choice | Why |
|---|---|---|
| Identity provider | **Logto** (OSS, MPL-2.0) | Free at our scale AND open source, so both branches of "free → use it; else self-host OSS" collapse into one product. See §2. |
| Login flow | **OAuth 2.0 Device Authorization Grant (RFC 8628)** for the CLI, **auth-code + PKCE** for the web | The standard behind `gh auth login`, Stripe CLI, and Anthropic's `/login`. One Logto identity, both clients. |
| CLI language / packaging | **Go single binary via Homebrew** | Instant cold start (agents call it constantly), one static binary, no runtime deps, trivial cross-platform. |
| API surface | **Public FastAPI host `api.tendyourgarden.app`**, validating Logto tokens via **JWKS** | The backend becomes a real API that trusts standard OIDC tokens. No bespoke token scheme. |

---

## 2. Why Logto (and the smoke test that settled it)

Brandon's rule: *if a managed provider is free at our scale, use it; otherwise build something simple or use open source.* Logto satisfies **both** at once, which removes the lock-in risk entirely:

- **Free managed cloud now:** 50,000 MAU free tier with the device grant **included, not gated** (verified via research, Aug 2026). We have a handful of users; cost is $0 for the foreseeable future.
- **Open-source escape hatch forever:** MPL-2.0 (permissive, no AGPL copyleft trap). If the cloud ever costs money, we self-host the identical software for free. No migration, no re-architecture.
- **First-party SDKs for our exact stack:** `@logto/next` for the web app, documented FastAPI JWKS validation for the backend.

**Smoke test (2026-09-01, hands-on):** ran the Logto OSS Docker build locally and confirmed the device flow is real, not just documented:
1. OIDC discovery advertises `device_authorization_endpoint` (`/oidc/device/auth`) and lists `urn:ietf:params:oauth:grant-type:device_code` in `grant_types_supported`.
2. POSTing a device request reaches the live device-grant handler and performs real client validation (structured `invalid_client` OAuth error), where a nonexistent route returns plain 404. The endpoint is a working device-authorization server.

This proves the **self-host path** (the load-bearing no-lock-in guarantee) with our own hands. Cloud free-tier device flow is confirmed by research + same-codebase inference; if we want belt-and-suspenders, a 10-minute test against a real Logto Cloud tenant confirms it, but it does not gate the decision.

**Runners-up, for the record:** WorkOS AuthKit (1M MAU free, device flow free, best Next.js DX) lost only on being closed-source with no self-host escape. Clerk was disqualified — it does not implement device flow at all. Auth0's free-tier device flow was unconfirmed with a punishing paid cliff. Zitadel matched Logto but has a harsher free limit (100 daily users) and AGPL.

---

## 3. What Logto replaces (the simplicity win)

Adopting Logto *deletes* security-critical code we'd otherwise maintain forever, and retires the awkward pieces of the current design:

- **Delete** hand-rolled email/password login, signup, forgot/reset-password, bcrypt, and login rate-limiting from the backend. Logto owns all of it.
- **Delete** the internal proxy-JWT contraption (`INTERNAL_JWT_SECRET`, the 60s HS256 mint in `frontend/src/lib/backend-jwt.ts`, the shared-secret trust in `backend/app/core/security.py`). The backend validates real Logto tokens via JWKS instead.
- **Never build** the custom PAT table, token hashing, device-code endpoints, or `/device` approval page from the earlier draft of this plan. Logto issues, refreshes, and revokes tokens.
- **Keep** Next.js, FastAPI, Postgres unchanged. Only the auth layer swaps out. This directly answers the "is Next.js painting me into a corner" worry: the stack is fine; we're upgrading the one component (NextAuth) that was the wrong shape for issuing tokens to a CLI.

---

## 4. Target architecture

```
                    ┌──────────────  Logto (identity)  ──────────────┐
                    │   cloud free tier now  /  self-host later (OSS)  │
                    └──────▲───────────────────────────────▲──────────┘
              auth-code +  │                                │  device
              PKCE (web)   │                                │  grant (CLI)
                           │                                │
        Browser ── Next.js ┘                                └── tend CLI (Go)
                    │                                             │
                    │  Logto access token (JWT)                   │  Logto access token (JWT)
                    ▼                                             ▼
             api.tendyourgarden.app ── FastAPI: validate JWT via Logto JWKS ── Postgres
```

- **One identity, two clients.** The web app logs in via auth-code + PKCE (`@logto/next`); the CLI logs in via the device grant. Both receive Logto access tokens.
- **The backend trusts one thing: a valid Logto token.** FastAPI fetches Logto's public keys (JWKS), caches them, verifies the token signature + audience + expiry, maps the Logto subject to a Tend user (provisioning on first login), and applies authorization (scopes/roles for read / write / triage).
- **Backend goes public** at `api.tendyourgarden.app` so the CLI can reach it. Additive; see §6 for the browser path sub-decision.

---

## 5. CLI UX (unchanged from the intent)

```
$ brew install brandon/tap/tend
$ tend login
  → opens browser to Logto; you approve (already signed in, or sign in once)
  ← ✓ Connected as brandon@… (token stored in macOS Keychain)
$ tend add "file the appellate brief #work !!"
$ tend ls -b today
$ tend whoami / tend logout
```

Token storage: refresh token in the OS keychain (`zalando/go-keyring`, file fallback for headless/CI); the CLI refreshes access tokens as needed. Revoke from Logto (or web settings surfaced through Logto). Non-secret config (`api_url`) in `~/.config/tend/config.toml`. `--json` on every read command for agents.

---

## 6. Open sub-decisions (resolve at build time, not blocking)

1. **Browser → backend path.** Two clean options once the backend is public:
   - *Keep a thin Next.js proxy* that attaches the browser's Logto token server-side (token stays in an httpOnly cookie, more XSS-resistant). Backend can stay private to the browser.
   - *Browser calls `api.` directly* with its Logto token (needs CORS; token lives in JS). Collapses the proxy entirely — one auth path for all clients, more modular.
   Lean: keep browser tokens server-side (XSS posture) while exposing `api.` for token-bearing clients (CLI). Decide when we wire the web SDK.
2. **User migration.** Existing accounts (Brandon + comped pro accounts) move to Logto — a one-time re-auth, trivial at current scale, but name it in the migration step so it isn't a surprise.
3. **Scopes/roles granularity.** Ship read + write + triage, plus the hard denials (no delete, no account settings). Model them as Logto scopes/roles; don't over-engineer.

---

## 7. Build sequencing (phases)

Dependency-ordered. Command-API grammar is Phase 4's follow-up, deferred per this plan's scope.

Issues live in the **"Tend CLI + Logto auth"** milestone (`meninoebom/tend`), created 2026-09-10.

0. **Stand up Logto** — #223 (local OSS dev harness), #224 (configure apps/API resource/scopes).
1. **Backend auth swap** — #225 (JWKS validation, replace proxy-JWT), #226 (`logto_sub` migration + provisioning), #227 (scope enforcement).
2. **Web auth swap** — #228 (NextAuth → `@logto/next`), #229 (remove legacy auth), #230 (migrate users), #231 (retire `INTERNAL_JWT_SECRET`).
3. **Public API host** — #232 (expose `api.tendyourgarden.app`), #233 (security pass).
4. **Go CLI** — #234 (scaffold), #235 (keychain token storage), #236 (device-flow login/logout/whoami), #237 (HTTP client), #238 (command surface — deferred, needs the grammar follow-up plan).
5. **Distribution** — #239 (GoReleaser + Homebrew tap). Plus non-repo follow-ups: fix the shell-alias collision, update the `tend` skill to match reality.

---

## 8. Follow-ups / notes (non-blocking)

- **Shell-alias collision:** `tend` is currently `cd ~/dev/tend` (`dotfiles/zsh/.aliases.sh:30`), which shadows the binary. Rename the alias (e.g. `cdtend`) before ship.
- **Retire `INTERNAL_JWT_SECRET`** once the backend validates Logto tokens; rotate it out of Railway shared variables.
- **Plot is not a design input.** If Plot survives, it becomes just another Logto client. It gets no say in Tend's architecture. (This also lets Plot drop its embedded `INTERNAL_JWT_SECRET` impersonation shortcut.)
- **Command grammar** (`#domain`, `!`/`!!`/`u!`, `>bucket`, `~size`) is sketched in the existing `tend` skill; the follow-up plan formalizes it against the real API contract.

# Local Logto for Tend auth development

A local [Logto](https://logto.io) (OSS, MPL-2.0) instance for developing and testing
Tend's unified auth: web login (auth-code + PKCE) and the CLI login (OAuth 2.0 Device
Authorization Grant, RFC 8628). This lets all the auth work in the
[Tend CLI + Logto auth](../../docs/plans/2026-08-20-feat-tend-cli-architecture.md)
milestone proceed **without a Logto Cloud account** — the cloud-vs-self-host call is
deferred to production deploy time.

> Dev only. Do not use this compose file, its seeded secrets, or its default Postgres
> password in production.

## Start / stop

```bash
# from the repo root
docker compose -f infra/logto-dev/docker-compose.yml up -d      # start
docker compose -f infra/logto-dev/docker-compose.yml logs -f logto   # watch boot/seed
docker compose -f infra/logto-dev/docker-compose.yml down       # stop (keeps data)
docker compose -f infra/logto-dev/docker-compose.yml down -v    # stop + WIPE tenant config
```

First boot pulls images and seeds the database, so it takes a minute or two. Postgres is
persisted to a named volume, so the apps / API resource / scopes you configure (issue
#224) survive a plain `down`/`up`. `down -v` wipes them.

Pin a specific Logto version with `LOGTO_TAG=1.x docker compose ... up -d`.

## Endpoints

| URL | What |
|---|---|
| http://localhost:3001 | Core API + OIDC endpoints (issuer) |
| http://localhost:3001/oidc/.well-known/openid-configuration | OIDC discovery |
| http://localhost:3002 | Admin console (first visit prompts you to create the admin user) |

## First-run setup

1. Open the admin console at http://localhost:3002 and create the initial admin account
   (local only; any email/password works).
2. Configure the tenant per issue #224 (web app, native CLI app with the device grant
   enabled, the `https://api.tendyourgarden.app` API resource, and the `tasks:read` /
   `tasks:write` / `triage` scopes). The reproducible values will be documented in
   `docs/auth/logto-setup.md`.

## Verify it's up (and that device flow is really enabled)

```bash
# 1. Discovery advertises the device grant
curl -s http://localhost:3001/oidc/.well-known/openid-configuration \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); \
print("device endpoint:", d.get("device_authorization_endpoint")); \
print("device grant:", "urn:ietf:params:oauth:grant-type:device_code" in d.get("grant_types_supported", []))'

# 2. The device endpoint is live (a bogus client gets a structured OAuth error, not a 404)
curl -s -X POST http://localhost:3001/oidc/device/auth \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "client_id=nonexistent&scope=openid"
# → {"error":"invalid_client",...}  (HTTP 400) = a real device-authorization server
```

Expected: `device grant: True`, and the device endpoint returns `invalid_client` for a
bogus client rather than a 404.

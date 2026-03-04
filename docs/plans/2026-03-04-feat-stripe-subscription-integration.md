# Stripe Subscription Integration — Tend Pro

**Date:** 2026-03-04
**Status:** Approved

## Context

Tend is a working web app with auth, triage, domains, and onboarding — all deployed on Railway. The next step toward sustainability is letting people pay for it. The monetization model: **AI features are the paywall**. The core triage loop stays free. Stripe Checkout handles payments (no custom payment form).

## Tier Model

| | Free | Pro ($5/mo) |
|--|------|-------------|
| Core triage loop | Yes | Yes |
| Domains (5 max) | Yes | Yes |
| Unlimited tasks | Yes | Yes |
| Basic stats | Yes | Yes |
| AI Triage Briefing | No | Yes (future) |
| AI "What's Next" | No | Yes (future) |
| Extended stats/trends | No | Yes (future) |

**Only AI features are gated.** No task limits, no domain limits. The paywall is simple: AI costs money to run, so charging is justified. Everything else is free.

## Implementation Phases

### Phase 1: Data Model + Config

**Migration** — add to `users` table:
- `stripe_customer_id` (TEXT, nullable, unique, indexed)
- `subscription_status` (TEXT, NOT NULL, default `"free"`, CHECK constraint)

**New enum** in `backend/app/models/enums.py`:
```python
class SubscriptionStatus(StrEnum):
    free = "free"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"
```

**User model** — add both fields (same StrEnum-as-TEXT pattern).

**Config** (`backend/app/core/config.py`) — add:
- `stripe_secret_key: str = ""`
- `stripe_webhook_secret: str = ""`
- `stripe_price_id: str = ""`

**Dependency**: `stripe` package in `pyproject.toml`.

### Phase 2: Backend Billing Routes

New file: `backend/app/api/billing.py` (prefix `/billing`)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /billing/checkout` | Yes | Create Stripe Checkout session, return `checkout_url` |
| `POST /billing/portal` | Yes | Create Customer Portal session, return `portal_url` |
| `GET /billing/status` | Yes | Return `{ subscription_status, is_pro }` |

Checkout creates a Stripe Customer on first call (stores `stripe_customer_id` immediately).

`is_pro = status in ("active", "past_due")` — past_due keeps access; Stripe handles dunning.

### Phase 3: Webhook Handler

**Backend**: `POST /billing/webhook` in `billing.py` — unauthenticated, signature-verified.

**Frontend forwarding**: New `frontend/src/app/api/stripe-webhook/route.ts` — forwards raw body + `Stripe-Signature` header to backend. Same pattern as password-reset routes.

**Events handled:**
- `checkout.session.completed` → set `subscription_status = "active"`
- `customer.subscription.updated` → map Stripe status to local enum
- `customer.subscription.deleted` → set `subscription_status = "free"`

Service layer: `backend/app/services/billing_service.py`

### Phase 4: Schema + Frontend Types

**Backend** — add to `UserResponse`:
- `subscription_status: str`
- `is_pro: bool`

**Frontend** `api-types.ts` — add to `User`:
```typescript
subscription_status: "free" | "active" | "past_due" | "canceled";
is_pro: boolean;
```

**Frontend** `api.ts` — add:
- `createCheckout()` → `{ checkout_url }`
- `createPortalSession()` → `{ portal_url }`

### Phase 5: Frontend UI (minimal)

1. **Settings page** — "Subscription" section: shows plan, "Upgrade to Pro" or "Manage Billing" button
2. **Return URLs** — `success_url: /settings?upgraded=true`, `cancel_url: /settings`

No public pricing page for v1. Upgrade flow lives in settings. AI feature gates will show "Upgrade to Pro" when AI features are built.

## Files to Modify/Create

| File | Action |
|------|--------|
| `backend/app/models/enums.py` | Add `SubscriptionStatus` |
| `backend/app/models/user.py` | Add `stripe_customer_id`, `subscription_status` fields |
| `backend/app/schemas/user.py` | Add fields to `UserResponse` |
| `backend/app/core/config.py` | Add Stripe env vars |
| `backend/app/api/billing.py` | **New** — checkout, portal, status, webhook routes |
| `backend/app/services/billing_service.py` | **New** — webhook handling logic |
| `backend/app/main.py` | Register billing router |
| `backend/alembic/versions/` | **New** migration |
| `backend/pyproject.toml` | Add `stripe` dependency |
| `frontend/src/lib/api-types.ts` | Add subscription fields to `User` |
| `frontend/src/lib/api.ts` | Add billing API functions |
| `frontend/src/app/api/stripe-webhook/route.ts` | **New** — webhook forwarding |
| `frontend/src/app/(app)/settings/page.tsx` | Add subscription section |

## Implementation Order

```
1. Enum + User model + migration
2. stripe dependency + config env vars
3. billing_service.py + billing.py routes
4. Webhook handler (backend + frontend)
5. UserResponse schema + frontend types
6. Frontend UI (settings subscription section)
7. Tests
8. Stripe Dashboard setup + Railway env vars + deploy
```

## Testing

- Mock `stripe` module at service level (never call Stripe in tests)
- Test checkout/portal/status/webhook endpoints
- Test webhook signature verification (reject invalid)
- Test webhook updates subscription_status correctly for each event type

## Deployment Checklist

1. Create Stripe account + Product ("Tend Pro") + Price (monthly)
2. Configure Stripe Customer Portal in Dashboard
3. Railway env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
4. Register webhook URL in Stripe: `https://tend.domain/api/stripe-webhook`
5. Deploy backend first (migration), then frontend

## Key Design Decisions

- **No `subscriptions` table** — single sub per user, status on User is enough. Add table if multi-plan needed later.
- **`past_due` keeps access** — Stripe handles retry/dunning. We cut off on `subscription.deleted`.
- **No task/domain limits** — only AI features are gated. Simpler, less frustrating, and AI has real marginal cost.
- **$5/month** — low barrier, impulse-buy territory for indie productivity tools.
- **No pricing page v1** — upgrade flow in settings. Public page later.

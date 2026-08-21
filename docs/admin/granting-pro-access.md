# Granting Pro Access (Admin / Ops)

How "pro" works in Tend, and how to grant it to an account manually (e.g. the owner
testing pro features, or comping an account) without going through Stripe checkout.

## How pro is gated

There is **no separate `is_pro` column, tier, or flag**. Pro is derived entirely from
one field on the `users` row:

```python
is_pro = user.subscription_status in ("active", "past_due")
```

`subscription_status` is a `String` column (values from `SubscriptionStatus` in
`backend/app/models/enums.py`: `free`, `active`, `past_due`, `canceled`). The
`is_pro` derivation is repeated (not centralized) in:

- `backend/app/api/account.py` — `is_pro` in the `/account` response
- `backend/app/api/domains.py` — domain-creation limit
- `backend/app/api/triage.py` — triage domain cap
- `backend/app/services/billing_service.py` — `is_pro` in billing status

So flipping `subscription_status` to `active` grants full pro behavior everywhere.

## What normally sets this field

Only the Stripe webhook path writes `subscription_status`
(`billing_service._update_status_by_customer`). It looks up the user **by
`stripe_customer_id`** and updates status on subscription lifecycle events
(`customer.subscription.updated` → `active`/`past_due`, `.deleted` → `free`).

**Key consequence:** a manual `active` is only ever overwritten by an incoming Stripe
webhook *matched to that user's `stripe_customer_id`*. Those webhooks fire only when a
real subscription action happens in Stripe/checkout for that customer. If the account
has no `stripe_customer_id`, nothing can revert a manual grant.

## Granting pro manually

It's a single-row UPDATE. Confirm the account first, then flip it.

### Local dev

```bash
psql postgresql://brandon@localhost:5432/tend_dev \
  -c "UPDATE users SET subscription_status='active' WHERE email='<email>';" \
  -c "SELECT email, subscription_status, stripe_customer_id FROM users WHERE email='<email>';"
```

### Production (Railway)

The Postgres internal host (`postgres.railway.internal`) is not reachable from a laptop.
Use the Postgres service's **public** proxy via `railway run`, which injects
`DATABASE_PUBLIC_URL` into the command so the credential never lands in your shell history:

```bash
railway run --service "Tend Postgres DB" -- \
  sh -c 'psql "$DATABASE_PUBLIC_URL" \
    -c "UPDATE users SET subscription_status='"'"'active'"'"' WHERE email='"'"'<email>'"'"';"'
```

(The Railway project is `Tend`; services are `Tend Frontend`, `Tend Backend`,
`Tend Postgres DB`. `railway status --json` lists them.)

## Caveats

- **If the account has a `stripe_customer_id`**, a future Stripe subscription event for
  that customer can overwrite the manual `active` (e.g. running checkout, or a lingering
  subscription emitting `deleted` → `free`). For the owner's own account this is fine;
  don't run billing actions in Stripe if you want the grant to stay put. To be bulletproof
  you *could* null out `stripe_customer_id`, but that breaks testing the real billing flow
  later, so prefer leaving it.
- **`active` vs `past_due`:** both count as pro. Use `active`.
- **Revoking:** set `subscription_status='free'`.
- This is a data change, not a code change — it does not survive a DB reset/reseed. For a
  permanent-across-resets comp you'd need an email allowlist in the `is_pro` checks, which
  is more invasive and not currently implemented.

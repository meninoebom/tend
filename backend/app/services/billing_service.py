"""Stripe billing service — wraps Stripe API interactions."""

import logging

import stripe
from sqlmodel import Session, select

from app.core.config import settings
from app.core.errors import AppError
from app.models.user import User

logger = logging.getLogger(__name__)


def _configure_stripe() -> None:
    if not settings.stripe_secret_key:
        raise AppError(
            code="billing_unavailable",
            message="Billing is not configured",
            status_code=503,
        )
    stripe.api_key = settings.stripe_secret_key


def create_checkout_session(db: Session, user: User) -> str:
    """Create a Stripe Checkout session. Returns the checkout URL.

    Creates a Stripe Customer on first call and stores the ID.
    """
    _configure_stripe()

    # Create Stripe customer if first time
    if not user.stripe_customer_id:
        customer = stripe.Customer.create(email=user.email)
        user.stripe_customer_id = customer.id
        db.add(user)
        db.flush()

    session = stripe.checkout.Session.create(
        customer=user.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        success_url=f"{settings.frontend_url}/settings?billing=success",
        cancel_url=f"{settings.frontend_url}/settings?billing=cancel",
    )
    return session.url


def create_portal_session(user: User) -> str:
    """Create a Stripe Customer Portal session. Returns the portal URL."""
    _configure_stripe()

    if not user.stripe_customer_id:
        raise AppError(
            code="no_subscription",
            message="No billing account found. Please subscribe first.",
            status_code=400,
        )

    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.frontend_url}/settings",
    )
    return session.url


def get_billing_status(user: User) -> dict:
    """Return subscription status and pro flag."""
    return {
        "subscription_status": user.subscription_status,
        "is_pro": user.subscription_status in ("active", "past_due"),
    }


# --- Stripe status mapping ---

_STRIPE_STATUS_MAP = {
    "active": "active",
    "past_due": "past_due",
    "canceled": "canceled",
    "unpaid": "canceled",
    "incomplete": "free",
    "incomplete_expired": "free",
    "trialing": "active",
    "paused": "canceled",
}


def handle_webhook(payload: bytes, sig_header: str, db: Session) -> dict:
    """Verify and process a Stripe webhook event.

    Returns a dict with the processing result for logging.
    """
    if not settings.stripe_webhook_secret:
        raise AppError(
            code="billing_unavailable",
            message="Webhook not configured",
            status_code=503,
        )

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret,
        )
    except stripe.SignatureVerificationError:
        raise AppError(
            code="invalid_signature",
            message="Invalid webhook signature",
            status_code=400,
        )
    except ValueError:
        raise AppError(
            code="invalid_payload",
            message="Invalid webhook payload",
            status_code=400,
        )

    event_type = event["type"]

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        customer_id = session.get("customer")
        if customer_id:
            _update_status_by_customer(db, customer_id, "active")
            return {"event": event_type, "action": "set_active"}

    elif event_type == "customer.subscription.updated":
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        stripe_status = sub.get("status", "")
        local_status = _STRIPE_STATUS_MAP.get(stripe_status, "free")
        if customer_id:
            _update_status_by_customer(db, customer_id, local_status)
            return {"event": event_type, "action": f"set_{local_status}"}

    elif event_type == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_id = sub.get("customer")
        if customer_id:
            _update_status_by_customer(db, customer_id, "free")
            return {"event": event_type, "action": "set_free"}

    return {"event": event_type, "action": "ignored"}


def _update_status_by_customer(db: Session, customer_id: str, status: str) -> None:
    """Look up user by stripe_customer_id and update subscription_status."""
    user = db.exec(
        select(User).where(User.stripe_customer_id == customer_id)
    ).first()
    if user is None:
        logger.warning("Webhook: no user found for customer %s", customer_id)
        return
    user.subscription_status = status
    db.add(user)
    db.flush()

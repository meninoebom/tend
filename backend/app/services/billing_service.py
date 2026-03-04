"""Stripe billing service — wraps Stripe API interactions."""

import stripe
from sqlmodel import Session

from app.core.config import settings
from app.core.errors import AppError
from app.models.user import User


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

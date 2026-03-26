"""Billing routes: checkout, portal, status, webhook."""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.core.deps import get_db
from app.core.errors import NotFoundError
from app.core.rate_limit import limiter
from app.core.security import get_current_user_id
from app.models.user import User
from app.services import billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


def _get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")
    return user


@router.post("/checkout")
def create_checkout(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Create a Stripe Checkout session for subscription."""
    user = _get_user(db, user_id)
    checkout_url = billing_service.create_checkout_session(db, user)
    return {"checkout_url": checkout_url}


@router.post("/portal")
def create_portal(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Create a Stripe Customer Portal session."""
    user = _get_user(db, user_id)
    portal_url = billing_service.create_portal_session(user)
    return {"portal_url": portal_url}


@router.get("/status")
def get_status(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Get current subscription status."""
    user = _get_user(db, user_id)
    return billing_service.get_billing_status(user)


@router.post("/webhook")
@limiter.limit("60/minute")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Handle Stripe webhook events. Unauthenticated — verified by signature."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    billing_service.handle_webhook(payload, sig_header, db)
    return {"received": True}

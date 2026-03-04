"""Tests for subscription-related model fields and config (GH-61, GH-62)."""

from sqlmodel import Session

from app.core.config import Settings
from app.models.enums import SubscriptionStatus
from app.models.user import User


def test_subscription_status_enum_values():
    """SubscriptionStatus has the expected values."""
    assert SubscriptionStatus.free == "free"
    assert SubscriptionStatus.active == "active"
    assert SubscriptionStatus.past_due == "past_due"
    assert SubscriptionStatus.canceled == "canceled"


def test_user_has_subscription_fields():
    """User model has stripe_customer_id and subscription_status with defaults."""
    user = User(email="test@example.com")
    assert user.stripe_customer_id is None
    assert user.subscription_status == "free"


def test_user_subscription_status_persists(db: Session):
    """subscription_status is stored and retrieved correctly."""
    user = User(
        email="stripe-test@example.com",
        subscription_status=SubscriptionStatus.active,
        stripe_customer_id="cus_test123",
    )
    db.add(user)
    db.flush()

    fetched = db.get(User, user.id)
    assert fetched is not None
    assert fetched.subscription_status == "active"
    assert fetched.stripe_customer_id == "cus_test123"


def test_user_default_subscription_status_persists(db: Session):
    """New users default to 'free' subscription_status in the DB."""
    user = User(email="free-user@example.com")
    db.add(user)
    db.flush()

    fetched = db.get(User, user.id)
    assert fetched is not None
    assert fetched.subscription_status == "free"
    assert fetched.stripe_customer_id is None


def test_stripe_config_fields():
    """Settings has stripe config fields with empty defaults."""
    s = Settings(
        database_url="postgresql://localhost/test",
        internal_jwt_secret="test",
    )
    assert s.stripe_secret_key == ""
    assert s.stripe_webhook_secret == ""
    assert s.stripe_price_id == ""

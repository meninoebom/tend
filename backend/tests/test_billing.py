"""Tests for billing routes and subscription schema (GH-63, GH-65)."""

import uuid
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.user import User


# --- #65: UserResponse includes subscription fields ---


def test_get_me_includes_subscription_fields(client: TestClient, test_user: User):
    """GET /me returns subscription_status and is_pro."""
    resp = client.get("/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["subscription_status"] == "free"
    assert data["is_pro"] is False


def test_get_me_active_user_is_pro(client: TestClient, db: Session, test_user: User):
    """Active subscription means is_pro=True."""
    test_user.subscription_status = "active"
    db.add(test_user)
    db.flush()

    resp = client.get("/me")
    data = resp.json()
    assert data["subscription_status"] == "active"
    assert data["is_pro"] is True


def test_get_me_past_due_is_pro(client: TestClient, db: Session, test_user: User):
    """Past-due subscription still counts as pro."""
    test_user.subscription_status = "past_due"
    db.add(test_user)
    db.flush()

    resp = client.get("/me")
    data = resp.json()
    assert data["is_pro"] is True


def test_get_me_canceled_not_pro(client: TestClient, db: Session, test_user: User):
    """Canceled subscription is not pro."""
    test_user.subscription_status = "canceled"
    db.add(test_user)
    db.flush()

    resp = client.get("/me")
    data = resp.json()
    assert data["is_pro"] is False


# --- #63: Billing routes ---


def test_billing_status_free_user(client: TestClient, test_user: User):
    """GET /billing/status returns free status for new user."""
    resp = client.get("/billing/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["subscription_status"] == "free"
    assert data["is_pro"] is False


def test_billing_status_active_user(client: TestClient, db: Session, test_user: User):
    """GET /billing/status returns is_pro=True for active user."""
    test_user.subscription_status = "active"
    db.add(test_user)
    db.flush()

    resp = client.get("/billing/status")
    data = resp.json()
    assert data["subscription_status"] == "active"
    assert data["is_pro"] is True


@patch("app.services.billing_service.settings")
@patch("app.services.billing_service.stripe")
def test_checkout_creates_customer_and_session(
    mock_stripe: MagicMock,
    mock_settings: MagicMock,
    client: TestClient,
    db: Session,
    test_user: User,
):
    """POST /billing/checkout creates Stripe customer and returns checkout URL."""
    mock_settings.stripe_secret_key = "sk_test_123"
    mock_settings.stripe_price_id = "price_123"
    mock_settings.frontend_url = "http://localhost:3000"

    mock_stripe.Customer.create.return_value = MagicMock(id="cus_new_123")
    mock_stripe.checkout.Session.create.return_value = MagicMock(
        url="https://checkout.stripe.com/session_123"
    )

    resp = client.post("/billing/checkout")
    assert resp.status_code == 200
    assert resp.json()["checkout_url"] == "https://checkout.stripe.com/session_123"

    # Customer was created
    mock_stripe.Customer.create.assert_called_once_with(email=test_user.email)

    # Verify stripe_customer_id was stored
    db.refresh(test_user)
    assert test_user.stripe_customer_id == "cus_new_123"


@patch("app.services.billing_service.settings")
@patch("app.services.billing_service.stripe")
def test_checkout_reuses_existing_customer(
    mock_stripe: MagicMock,
    mock_settings: MagicMock,
    client: TestClient,
    db: Session,
    test_user: User,
):
    """POST /billing/checkout reuses existing stripe_customer_id."""
    mock_settings.stripe_secret_key = "sk_test_123"
    mock_settings.stripe_price_id = "price_123"
    mock_settings.frontend_url = "http://localhost:3000"

    test_user.stripe_customer_id = "cus_existing_456"
    db.add(test_user)
    db.flush()

    mock_stripe.checkout.Session.create.return_value = MagicMock(
        url="https://checkout.stripe.com/session_456"
    )

    resp = client.post("/billing/checkout")
    assert resp.status_code == 200
    # Should NOT create a new customer
    mock_stripe.Customer.create.assert_not_called()


@patch("app.services.billing_service.settings")
@patch("app.services.billing_service.stripe")
def test_portal_returns_url(
    mock_stripe: MagicMock,
    mock_settings: MagicMock,
    client: TestClient,
    db: Session,
    test_user: User,
):
    """POST /billing/portal returns portal URL."""
    mock_settings.stripe_secret_key = "sk_test_123"
    mock_settings.frontend_url = "http://localhost:3000"

    test_user.stripe_customer_id = "cus_existing_789"
    db.add(test_user)
    db.flush()

    mock_stripe.billing_portal.Session.create.return_value = MagicMock(
        url="https://billing.stripe.com/portal_789"
    )

    resp = client.post("/billing/portal")
    assert resp.status_code == 200
    assert resp.json()["portal_url"] == "https://billing.stripe.com/portal_789"


def test_portal_400_without_customer(client: TestClient, test_user: User):
    """POST /billing/portal returns 400 if no stripe_customer_id."""
    # Stripe key not set → 503, but we need to test the "no customer" path
    # which requires Stripe to be configured. We'll mock settings only.
    with patch("app.services.billing_service.settings") as mock_settings:
        mock_settings.stripe_secret_key = "sk_test_123"
        resp = client.post("/billing/portal")
        assert resp.status_code == 400
        assert resp.json()["code"] == "no_subscription"


def test_checkout_503_without_stripe_key(client: TestClient, test_user: User):
    """POST /billing/checkout returns 503 when Stripe is not configured."""
    resp = client.post("/billing/checkout")
    assert resp.status_code == 503
    assert resp.json()["code"] == "billing_unavailable"

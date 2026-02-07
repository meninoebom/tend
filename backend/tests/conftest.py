import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlmodel import Session

from app.core.deps import get_db
from app.core.security import get_current_user_id
from app.main import app
from app.models.domain import Domain
from app.models.enums import AuthProvider, BucketType, TaskStatus
from app.models.task import Task
from app.models.user import User

TEST_DB_URL = "postgresql://brandon@localhost:5432/tend_test"
TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")

engine = create_engine(TEST_DB_URL)


@pytest.fixture()
def db() -> Generator[Session]:
    """Provide a transactional database session that rolls back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db: Session) -> TestClient:
    """FastAPI test client wired to the transactional test session."""

    def _override_db() -> Generator[Session]:
        yield db

    def _override_user() -> uuid.UUID:
        return TEST_USER_ID

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user_id] = _override_user

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture()
def test_user(db: Session) -> User:
    """Create and return the test user."""
    user = User(
        id=TEST_USER_ID,
        email="test@tend.app",
        auth_provider=AuthProvider.email,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture()
def test_domains(db: Session, test_user: User) -> list[Domain]:
    """Create 3 test domains."""
    domains = []
    for i, (name, color) in enumerate(
        [("Work", "#3b82f6"), ("Personal", "#10b981"), ("Health", "#ef4444")]
    ):
        d = Domain(
            user_id=test_user.id, name=name, color=color, position=i
        )
        db.add(d)
        domains.append(d)
    db.flush()
    return domains


@pytest.fixture()
def test_tasks(db: Session, test_user: User, test_domains: list[Domain]) -> list[Task]:
    """Create a set of tasks across buckets."""
    tasks = []
    configs = [
        ("Build frontend", BucketType.today, test_domains[0].id),
        ("Read docs", BucketType.soon, test_domains[1].id),
        ("Go for a run", BucketType.today, test_domains[2].id),
        ("Refactor backend", BucketType.later, test_domains[0].id),
        ("Meditate", BucketType.someday, None),
    ]
    for text, bucket, domain_id in configs:
        t = Task(
            user_id=test_user.id,
            text=text,
            bucket=bucket,
            domain_id=domain_id,
            status=TaskStatus.pending,
        )
        db.add(t)
        tasks.append(t)
    db.flush()
    return tasks

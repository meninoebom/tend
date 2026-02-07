from collections.abc import Generator

from sqlalchemy import create_engine
from sqlmodel import Session

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_timeout=10,
)


def get_db() -> Generator[Session]:
    """Yield a session with automatic commit/rollback.

    Services NEVER call db.commit() — this dependency owns the transaction lifecycle.
    """
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise

import pytest

from app.core.config import Settings, with_psycopg2_driver


@pytest.mark.parametrize(
    "raw",
    [
        "postgres://u:p@host:5432/db",
        "postgresql://u:p@host:5432/db",
        "postgresql+psycopg2://u:p@host:5432/db",
    ],
)
def test_database_url_always_names_the_psycopg2_driver(raw: str) -> None:
    assert Settings(database_url=raw).database_url == "postgresql+psycopg2://u:p@host:5432/db"


def test_driver_pin_leaves_other_schemes_alone() -> None:
    assert with_psycopg2_driver("sqlite:///x.db") == "sqlite:///x.db"

from pydantic import model_validator
from pydantic_settings import BaseSettings


def with_psycopg2_driver(url: str) -> str:
    # Name the driver explicitly. SQLAlchemy 2.1 changed the default for plain
    # postgresql:// from psycopg2 to psycopg 3, which this app does not install.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url.removeprefix(prefix)
    return url


class Settings(BaseSettings):
    database_url: str = "postgresql://localhost:5432/tend_dev"
    allowed_origins: str = "http://localhost:3000"
    internal_jwt_secret: str = "change-me"
    resend_api_key: str = ""
    frontend_url: str = "http://localhost:3000"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""
    # Set by Railway automatically (e.g. "production"). Used to hide the
    # interactive API docs once the backend is reachable from the internet.
    railway_environment: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def is_production(self) -> bool:
        return self.railway_environment == "production"

    @model_validator(mode="after")
    def fix_database_url(self) -> "Settings":
        self.database_url = with_psycopg2_driver(self.database_url)
        return self


settings = Settings()

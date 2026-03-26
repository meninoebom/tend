from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://localhost:5432/tend_dev"
    allowed_origins: str = "http://localhost:3000"
    internal_jwt_secret: str = "change-me"
    resend_api_key: str = ""
    frontend_url: str = "http://localhost:3000"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def fix_database_url(self) -> "Settings":
        # Railway provides postgres:// but SQLAlchemy requires postgresql://
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql://", 1)
        return self


settings = Settings()

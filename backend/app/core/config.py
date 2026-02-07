from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://localhost:5432/tend_dev"
    allowed_origins: str = "http://localhost:3000"
    internal_jwt_secret: str = "change-me"
    reaper_api_key: str = "change-me"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

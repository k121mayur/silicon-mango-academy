from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Silicon Mango Academy API"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/silicon_academy"
    uploads_root: str = "uploads"
    allowed_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    secret_key: str = "replace-this-for-production"
    access_token_expire_minutes: int = 60 * 8
    master_admin_name: str = "Master Admin"
    master_admin_email: str = "admin@siliconmango.academy"
    master_admin_password: str = "Admin@123"
    default_instructor_password: str = "Instructor@123"
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_use_tls: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value: bool | str) -> bool:
        if isinstance(value, bool):
            return value

        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on", "debug", "development", "dev", "local"}:
            return True
        if normalized in {"0", "false", "no", "off", "release", "production", "prod"}:
            return False

        return value

    @field_validator("smtp_use_tls", mode="before")
    @classmethod
    def parse_smtp_use_tls(cls, value: bool | str | None) -> bool | None:
        if value is None or isinstance(value, bool):
            return value

        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
        return value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

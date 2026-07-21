from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Cyanea API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    api_base_url: str = "http://127.0.0.1:8000/api/v1"
    database_url: str = "postgresql+psycopg://cyanea:cyanea@localhost:5432/cyanea"
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"
    )

    # JWT
    secret_key: str = Field(default="cambia-esto-en-produccion-usa-un-secreto-real")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 horas

    # Google Auth
    google_auth_enabled: bool = False
    google_web_client_id: str | None = None
    google_android_client_id: str | None = None
    google_ios_client_id: str | None = None

    # Facebook Auth
    facebook_auth_enabled: bool = False
    facebook_app_id: str | None = None
    facebook_app_secret: str | None = None

    # Mail
    mail_enabled: bool = False
    mail_provider: str = "smtp"
    mail_host: str = "localhost"
    mail_port: int = 1025
    mail_username: str | None = None
    mail_password: str | None = None
    mail_use_tls: bool = True
    mail_from_email: str = "no-reply@cyanea.local"
    mail_from_name: str = "Cyanea"
    mail_reply_to: str | None = None
    mail_frontend_base_url: str = "http://127.0.0.1:8081"

    #Mapbox
    mapbox_access_token: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def mail_templates_dir(self) -> Path:
        return Path(__file__).resolve().parents[1] / "templates" / "emails"

    @property
    def google_client_ids(self) -> list[str]:
        return [
            client_id
            for client_id in [
                self.google_web_client_id,
                self.google_android_client_id,
                self.google_ios_client_id,
            ]
            if client_id
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
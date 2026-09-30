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
    google_maps_api_key: str | None = None

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

    # Push notifications
    push_enabled: bool = True
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_push_access_token: str | None = None

    # Activity reminders
    activity_reminders_enabled: bool = True
    activity_reminder_minutes_before: int = 60
    activity_reminder_scan_interval_seconds: int = 60

    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_bucket: str = "trip-documents"

    # Generación de imágenes con IA (portada de viaje, US 57)
    cloudflare_account_id: str | None = None
    cloudflare_api_token: str | None = None
    ai_image_model: str = "@cf/black-forest-labs/flux-1-schnell"
    # Si es True no se llama a ningún servicio externo: devuelve una imagen de prueba.
    ai_cover_mock: bool = False

    # Escaneo de comprobantes con IA (US 93)
    # Proveedor intercambiable por configuración (RNF-37): "gemini" o "mock".
    # Con "mock" no se llama a ningún servicio externo (desarrollo y tests).
    ai_receipt_provider: str = "gemini"
    gemini_api_key: str | None = None
    ai_receipt_model: str = "gemini-3.8-flash"
    # Modelo alternativo si el principal está saturado, llegó al límite de uso,
    # no responde a tiempo o fue retirado (RNF-30). Vacío = sin respaldo.
    ai_receipt_fallback_model: str | None = "gemini-3.5-flash-lite"
    # Tiempo máximo de espera al proveedor; se deja margen para cumplir los
    # 15 segundos totales del RNF-34 (subida + validaciones + respuesta).
    ai_receipt_timeout_seconds: float = 12.0

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

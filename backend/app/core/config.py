from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Cyanea API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    api_base_url: str = "http://127.0.0.1:8000/api/v1"
    terms_version: str = "2026-10-03"
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
    brevo_api_key: str | None = None

    # Push notifications
    push_enabled: bool = True
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_push_access_token: str | None = None

    # Activity reminders
    activity_reminders_enabled: bool = True
    activity_reminder_minutes_before: int = 60
    activity_reminder_scan_interval_seconds: int = 60

    # Actualización automática del estado de los viajes (US 103): todos los días a las 00:00.
    trip_status_update_enabled: bool = True
    trip_status_timezone: str = "America/Argentina/Buenos_Aires"

    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_bucket: str = "trip-documents"

    # Generación de imágenes con IA
    cloudflare_account_id: str | None = None
    cloudflare_api_token: str | None = None
    ai_image_model: str = "@cf/black-forest-labs/flux-1-schnell"
    # Si es True no se llama a ningún servicio externo: devuelve una imagen de prueba.
    ai_cover_mock: bool = False

    # Escaneo de comprobantes con IA
    ai_receipt_provider: str = "gemini"
    gemini_api_key: str | None = None
    gemini_verify_ssl: bool = True
    ai_receipt_model: str = "gemini-3.8-flash"
    ai_receipt_fallback_model: str | None = "gemini-3.5-flash-lite"
    ai_receipt_timeout_seconds: float = 12.0

    # Sugerencias de actividades con IA
    ai_suggestions_provider: str = "gemini"
    ai_suggestions_model: str | None = None
    ai_suggestions_fallback_model: str | None = None
    ai_suggestions_timeout_seconds: float = 20.0
    ai_suggestions_total_timeout_seconds: float = 28.0
    ai_suggestions_daily_limit: int = 10
    ai_suggestions_max_distance_km: float = 15.0
    ai_suggestions_max_results: int = 5
    ai_suggestions_timezone: str = "America/Argentina/Buenos_Aires"

    # Asistente IA del viaje
    ai_assistant_enabled: bool = True
    ai_assistant_provider: str = "gemini"
    ai_assistant_model: str | None = None
    ai_assistant_fallback_model: str | None = None
    ai_assistant_timeout_seconds: float = 20.0

    # Recomendación de entradas y reservas de actividades (sitio oficial + Gemini)
    ai_entradas_enabled: bool = True
    # Vacíos: se usan AI_RECEIPT_MODEL y AI_RECEIPT_FALLBACK_MODEL.
    ai_entradas_model: str | None = None
    ai_entradas_fallback_model: str | None = None
    ai_entradas_timeout_seconds: float = 12.0
    entradas_sitio_timeout_seconds: float = 6.0
    entradas_sitio_max_paginas: int = 3
    entradas_timeout_total_seconds: float = 20.0
    entradas_cache_ttl_seconds: int = 6 * 60 * 60
    # Respaldo con la búsqueda de Google integrada en Gemini cuando el sitio oficial
    # no se puede leer o no confirma nada. Requiere facturación activa en Gemini.
    ai_entradas_busqueda_google: bool = True
    ai_entradas_busqueda_timeout_seconds: float = 15.0

    expense_edit_lock_ttl_seconds: int = 120

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


    @field_validator("database_url")
    @classmethod
    def usar_driver_psycopg(cls, v: str) -> str:
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

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

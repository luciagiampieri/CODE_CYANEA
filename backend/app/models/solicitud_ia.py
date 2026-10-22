from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _ahora_utc() -> datetime:
    return datetime.now(timezone.utc)


class SolicitudIA(Base):
    """Una llamada a un servicio de IA (US 106 y US 114).

    Solo guarda metadatos de consumo: nunca el contenido de la solicitud ni datos
    del usuario o del viaje (RNF-33)."""

    __tablename__ = "SolicitudesIA"

    IdSolicitudIA: Mapped[int] = mapped_column(primary_key=True)
    Fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_ahora_utc,
        server_default=func.now(),
        index=True,
    )
    Servicio: Mapped[str] = mapped_column(String(50), nullable=False)
    Modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    Exitosa: Mapped[bool] = mapped_column(Boolean, nullable=False)
    DuracionMs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    TokensEntrada: Mapped[int | None] = mapped_column(Integer, nullable=True)
    TokensSalida: Mapped[int | None] = mapped_column(Integer, nullable=True)
    Imagenes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    CostoEstimadoUSD: Mapped[Decimal] = mapped_column(
        Numeric(12, 6), nullable=False, default=Decimal("0"), server_default="0"
    )

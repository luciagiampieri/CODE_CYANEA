from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

ID_CONFIGURACION_MONITOREO_IA = 1


class ConfiguracionMonitoreoIA(Base):
    """Configuración del monitoreo de consumo de IA (US 114). Tiene una sola fila.

    `PeriodoUltimaAlerta` (AAAA-MM) y `UmbralUltimaAlertaUSD` evitan reenviar el
    correo de umbral superado en el mismo mes para el mismo umbral."""

    __tablename__ = "ConfiguracionesMonitoreoIA"

    IdConfiguracionMonitoreoIA: Mapped[int] = mapped_column(Integer, primary_key=True)
    UmbralCostoMensualUSD: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    FechaActualizacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    IdUsuarioActualizacion: Mapped[int | None] = mapped_column(
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_ConfiguracionesMonitoreoIA_Usuarios_IdUsuarioActualizacion",
        ),
        nullable=True,
    )
    PeriodoUltimaAlerta: Mapped[str | None] = mapped_column(String(7), nullable=True)
    UmbralUltimaAlertaUSD: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    FechaUltimaAlerta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

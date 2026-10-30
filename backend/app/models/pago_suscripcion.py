from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EstadoPagoSuscripcion(Base):
    __tablename__ = "EstadosPagosSuscripciones"

    IdEstadoPagoSuscripcion: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    Activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )


class PagoSuscripcion(Base):
    """Registro financiero mínimo: no admite datos de tarjeta ni respuestas crudas de pasarelas."""

    __tablename__ = "PagosSuscripciones"
    __table_args__ = (
        CheckConstraint('"MontoARS" > 0', name="CK_PagosSuscripciones_MontoPositivo"),
        CheckConstraint(
            '("PeriodoDesde" IS NULL AND "PeriodoHasta" IS NULL) '
            'OR "PeriodoHasta" > "PeriodoDesde"',
            name="CK_PagosSuscripciones_Periodo",
        ),
    )

    IdPagoSuscripcion: Mapped[int] = mapped_column(primary_key=True)
    IdSuscripcionUsuario: Mapped[int] = mapped_column(
        ForeignKey("SuscripcionesUsuarios.IdSuscripcionUsuario"), nullable=False, index=True
    )
    IdEstadoPagoSuscripcion: Mapped[int] = mapped_column(
        ForeignKey("EstadosPagosSuscripciones.IdEstadoPagoSuscripcion"), nullable=False, index=True
    )
    FechaPago: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    MontoARS: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    IdOperacionPasarela: Mapped[str | None] = mapped_column(String(150), nullable=True, unique=True)
    # Período que el cobro paga o intentaba pagar (US 120). NULL en pagos históricos
    # cuya periodicidad no se conoce.
    PeriodoDesde: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    PeriodoHasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

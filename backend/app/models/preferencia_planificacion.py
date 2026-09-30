from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Table,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

# Relación N a N entre las preferencias de un participante y los intereses elegidos.
preferencias_planificacion_intereses = Table(
    "PreferenciasPlanificacionIntereses",
    Base.metadata,
    Column(
        "IdPreferenciaPlanificacion",
        ForeignKey(
            "PreferenciasPlanificacion.IdPreferenciaPlanificacion",
            name="FK_PrefPlanInt_PrefPlan_IdPreferenciaPlanificacion",
            ondelete="CASCADE",
        ),
        primary_key=True,
    ),
    Column(
        "IdInteresPlanificacion",
        ForeignKey(
            "InteresesPlanificacion.IdInteresPlanificacion",
            name="FK_PrefPlanInt_IntPlan_IdInteresPlanificacion",
        ),
        primary_key=True,
    ),
)


class PreferenciaPlanificacion(Base):
    """Preferencias de planificación de un participante para un viaje (US 86).

    Se cuelga de ParticipanteViaje (y no de Usuario) para que las preferencias
    sean individuales por participante y por viaje (RNF-14).
    """

    __tablename__ = "PreferenciasPlanificacion"
    __table_args__ = (
        CheckConstraint(
            '"PresupuestoDiarioARS" IS NULL OR "PresupuestoDiarioARS" > 0',
            name="CK_PreferenciasPlanificacion_Presupuesto",
        ),
    )

    IdPreferenciaPlanificacion: Mapped[int] = mapped_column(primary_key=True)
    IdParticipanteViaje: Mapped[int] = mapped_column(
        ForeignKey(
            "ParticipantesViajes.IdParticipanteViaje",
            name="FK_PrefPlan_PartViajes_IdParticipanteViaje",
            ondelete="CASCADE",
        ),
        nullable=False,
        unique=True,
    )
    IdRitmoViaje: Mapped[int] = mapped_column(
        ForeignKey("RitmosViajes.IdRitmoViaje", name="FK_PrefPlan_RitmosViajes_IdRitmoViaje"),
        nullable=False,
    )
    # Presupuesto diario estimado por persona para actividades, en ARS (RN-39).
    PresupuestoDiarioARS: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    Consideraciones: Mapped[str | None] = mapped_column(String(300), nullable=True)
    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    FechaActualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    ParticipanteViaje = relationship("ParticipanteViaje")
    RitmoViaje = relationship("RitmoViaje")
    Intereses = relationship(
        "InteresPlanificacion",
        secondary=preferencias_planificacion_intereses,
        order_by="InteresPlanificacion.Orden",
    )

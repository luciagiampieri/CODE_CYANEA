from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TransferenciaLiquidacion(Base):
    __tablename__ = "TransferenciasLiquidaciones"
    __table_args__ = (
        CheckConstraint('"Monto" > 0', name="CK_TransferenciasLiquidaciones_Monto"),
        CheckConstraint(
            '"IdParticipanteDeudor" <> "IdParticipanteAcreedor"',
            name="CK_TransferenciasLiquidaciones_ParticipantesDistintos",
        ),
    )

    IdTransferenciaLiquidacion: Mapped[int] = mapped_column(primary_key=True)
    IdLiquidacion: Mapped[int] = mapped_column(
        ForeignKey(
            "LiquidacionesViajes.IdLiquidacion",
            name="FK_TransLiq_LiqViajes_IdLiquidacion",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    IdParticipanteDeudor: Mapped[int] = mapped_column(
        ForeignKey(
            "ParticipantesViajes.IdParticipanteViaje",
            name="FK_TransLiq_PartViajes_IdDeudor",
        ),
        nullable=False,
    )
    IdParticipanteAcreedor: Mapped[int] = mapped_column(
        ForeignKey(
            "ParticipantesViajes.IdParticipanteViaje",
            name="FK_TransLiq_PartViajes_IdAcreedor",
        ),
        nullable=False,
    )
    Monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    IdEstadoTransferenciaLiquidacion: Mapped[int] = mapped_column(
        ForeignKey(
            "EstadosTransferenciasLiquidaciones.IdEstadoTransferenciaLiquidacion",
            name="FK_TransLiq_Estados_IdEstado",
        ),
        nullable=False,
    )
    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    FechaConfirmacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    Liquidacion = relationship(
        "LiquidacionViaje",
        back_populates="Transferencias",
        foreign_keys=[IdLiquidacion],
    )
    ParticipanteDeudor = relationship(
        "ParticipanteViaje",
        foreign_keys=[IdParticipanteDeudor],
        back_populates="TransferenciasComoDeudor",
    )
    ParticipanteAcreedor = relationship(
        "ParticipanteViaje",
        foreign_keys=[IdParticipanteAcreedor],
        back_populates="TransferenciasComoAcreedor",
    )
    EstadoTransferencia = relationship(
        "EstadoTransferenciaLiquidacion",
        back_populates="Transferencias",
        foreign_keys=[IdEstadoTransferenciaLiquidacion],
    )

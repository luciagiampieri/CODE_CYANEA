from decimal import Decimal

from sqlalchemy import BigInteger,ForeignKey, UniqueConstraint, Numeric, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

class ParticipantesGastos(Base):
    __tablename__ = "ParticipantesGastos"

    __table_args__ = (
        UniqueConstraint("IdGasto", "IdParticipanteViaje", name="UX_ParticipantesGastos_IdGasto_IdParticipanteViaje"),

        CheckConstraint('"MontoAsignado" > 0', name="CK_ParticipantesGastos_MontoAsignado"),
    )

    IdParticipanteGasto: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    
    IdGasto: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("Gastos.IdGasto", ondelete="CASCADE", name="FK_ParticipantesGastos_Gastos_IdGasto"),
        nullable=True,
    )

    IdParticipanteViaje: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("ParticipantesViajes.IdParticipanteViaje", name="FK_ParticipantesGastos_ParticipantesViajes_IdParticipanteViaje"),
        nullable=False,
    )

    MontoAsignado: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    # Relaciones
    Gasto = relationship("Gasto", back_populates="ParticipantesAsociados", foreign_keys=[IdGasto])
    ParticipanteViaje = relationship("ParticipanteViaje", back_populates="GastosDondeParticipa", foreign_keys=[IdParticipanteViaje])
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class LiquidacionViaje(Base):
    __tablename__ = "LiquidacionesViajes"
    __table_args__ = (
        UniqueConstraint("IdViaje", "Version", name="UX_LiquidacionesViajes_IdViaje_Version"),
    )

    IdLiquidacion: Mapped[int] = mapped_column(primary_key=True)
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_LiqViajes_Viajes_IdViaje", ondelete="CASCADE"),
        nullable=False,
    )
    Version: Mapped[int] = mapped_column(nullable=False)
    Activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    FechaGeneracion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    Viaje = relationship(
        "Viaje",
        back_populates="Liquidaciones",
        foreign_keys=[IdViaje],
    )
    Transferencias = relationship(
        "TransferenciaLiquidacion",
        back_populates="Liquidacion",
        cascade="all, delete-orphan",
        foreign_keys="TransferenciaLiquidacion.IdLiquidacion",
    )

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EstadoTransferenciaLiquidacion(Base):
    __tablename__ = "EstadosTransferenciasLiquidaciones"

    IdEstadoTransferenciaLiquidacion: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    Activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    Transferencias = relationship(
        "TransferenciaLiquidacion",
        back_populates="EstadoTransferencia",
        foreign_keys="TransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion",
    )

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EscaneoComprobante(Base):
    __tablename__ = "EscaneosComprobantes"
    __table_args__ = (
        Index("IX_EscaneosComprobantes_Usuario_Fecha", "IdUsuario", "FechaEscaneo"),
    )

    IdEscaneoComprobante: Mapped[int] = mapped_column(primary_key=True)
    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_EscaneosComprobantes_Usuarios_IdUsuario"),
        nullable=False,
    )
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_EscaneosComprobantes_Viajes_IdViaje"),
        nullable=False,
    )
    FechaEscaneo: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
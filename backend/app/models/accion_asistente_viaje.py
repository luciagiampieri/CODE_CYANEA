from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AccionAsistenteViaje(Base):
    __tablename__ = "AccionesAsistenteViaje"

    IdAccionAsistente: Mapped[str] = mapped_column(String(36), primary_key=True)
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_AccionesAsistenteViaje_Viajes_IdViaje"),
        nullable=False,
    )
    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_AccionesAsistenteViaje_Usuarios_IdUsuario"),
        nullable=False,
    )
    Tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    Estado: Mapped[str] = mapped_column(String(30), nullable=False, default="propuesta", server_default="propuesta")
    Etiqueta: Mapped[str] = mapped_column(String(150), nullable=False)
    PayloadJson: Mapped[str] = mapped_column(Text(), nullable=False)
    ResultadoJson: Mapped[str | None] = mapped_column(Text(), nullable=True)
    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    FechaConfirmacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

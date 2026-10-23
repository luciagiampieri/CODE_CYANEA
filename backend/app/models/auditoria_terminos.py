from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

ACCION_PUBLICACION = "PUBLICACION"


class AuditoriaTerminos(Base):
    __tablename__ = "AuditoriaTerminos"

    IdAuditoriaTerminos: Mapped[int] = mapped_column(primary_key=True)
    IdVersionTerminos: Mapped[int] = mapped_column(
        ForeignKey("VersionesTerminos.IdVersionTerminos"), nullable=False, index=True
    )
    NumeroVersion: Mapped[str] = mapped_column(String(30), nullable=False)
    IdAdministrador: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario"), nullable=False
    )
    Accion: Mapped[str] = mapped_column(String(20), nullable=False)
    DireccionIp: Mapped[str | None] = mapped_column(String(45), nullable=True)
    FechaHora: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

ACCION_SUSPENSION = "SUSPENSION"
ACCION_REACTIVACION = "REACTIVACION"


class AuditoriaSuspensionUsuario(Base):

    __tablename__ = "AuditoriaSuspensionesUsuarios"

    IdAuditoriaSuspension: Mapped[int] = mapped_column(primary_key=True)
    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario"), nullable=False, index=True
    )
    IdAdministrador: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario"), nullable=False
    )
    Accion: Mapped[str] = mapped_column(String(20), nullable=False)
    Motivo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    DireccionIp: Mapped[str | None] = mapped_column(String(45), nullable=True)
    FechaHora: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
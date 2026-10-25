from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AuditoriaPlan(Base):
    __tablename__ = "AuditoriaPlanes"

    IdAuditoriaPlan: Mapped[int] = mapped_column(primary_key=True)
    IdPlan: Mapped[int] = mapped_column(ForeignKey("Planes.IdPlan"), nullable=False)
    IdAdministrador: Mapped[int] = mapped_column(ForeignKey("Usuarios.IdUsuario"), nullable=False)
    Campo: Mapped[str] = mapped_column(String(50), nullable=False)
    ValorAnterior: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ValorNuevo: Mapped[str] = mapped_column(String(50), nullable=False)
    DireccionIp: Mapped[str | None] = mapped_column(String(45), nullable=True)
    FechaHora: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

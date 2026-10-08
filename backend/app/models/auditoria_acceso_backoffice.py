from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AuditoriaAccesoBackoffice(Base):
    __tablename__ = "AuditoriaAccesosBackoffice"

    IdAuditoriaAcceso: Mapped[int] = mapped_column(primary_key=True)
    Email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    IdUsuario: Mapped[int | None] = mapped_column(
        ForeignKey("Usuarios.IdUsuario"), nullable=True
    )
    Exitoso: Mapped[bool] = mapped_column(Boolean, nullable=False)
    Motivo: Mapped[str] = mapped_column(String(40), nullable=False)
    DireccionIp: Mapped[str | None] = mapped_column(String(45), nullable=True)
    UserAgent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    FechaHora: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
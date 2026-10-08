from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SesionBackoffice(Base):
    __tablename__ = "SesionesBackoffice"

    IdSesionBackoffice: Mapped[str] = mapped_column(String(36), primary_key=True)
    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario"), nullable=False
    )
    FechaInicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    UltimaActividad: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    FechaCierre: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
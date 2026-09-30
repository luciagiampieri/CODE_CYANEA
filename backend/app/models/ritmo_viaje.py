from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RitmoViaje(Base):
    """Tabla maestra de ritmos de viaje para las preferencias de planificación (US 86)."""

    __tablename__ = "RitmosViajes"

    IdRitmoViaje: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    Descripcion: Mapped[str] = mapped_column(String(150), nullable=False)
    Orden: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    Activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

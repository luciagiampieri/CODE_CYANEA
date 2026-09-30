from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class InteresPlanificacion(Base):
    """Tabla maestra de intereses para las preferencias de planificación (US 86)."""

    __tablename__ = "InteresesPlanificacion"

    IdInteresPlanificacion: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    Icono: Mapped[str] = mapped_column(String(50), nullable=False, default="star")
    Orden: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    Activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

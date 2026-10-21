from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EstadoSuscripcion(Base):
    __tablename__ = "EstadosSuscripciones"

    IdEstadoSuscripcion: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    Descripcion: Mapped[str | None] = mapped_column(String(200), nullable=True)
    Activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    Suscripciones = relationship("SuscripcionUsuario", back_populates="EstadoSuscripcion")
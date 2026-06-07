from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EstadoViaje(Base):
    __tablename__ = "EstadosViajes"

    IdEstadoViaje: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), nullable=False)
    Descripcion: Mapped[str | None] = mapped_column(String(200), nullable=True)
    Activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    Viajes = relationship("Viaje", back_populates="EstadoViaje")

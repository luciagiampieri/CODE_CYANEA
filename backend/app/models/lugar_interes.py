from datetime import datetime

from sqlalchemy import Boolean, DateTime, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class LugarInteres(Base):
    __tablename__ = "LugaresInteres"

    IdLugarInteres: Mapped[int] = mapped_column(primary_key=True)
    GooglePlaceId: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    Nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    Direccion: Mapped[str] = mapped_column(String(255), nullable=False)
    Lat: Mapped[float] = mapped_column(nullable=False)
    Lng: Mapped[float] = mapped_column(nullable=False)
    Categoria: Mapped[str | None] = mapped_column(String(100), nullable=True)
    FotoUrl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    MetadataJson: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    Activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    FechaAlta: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    Viajes = relationship(
        "LugarInteresViaje",
        back_populates="LugarInteres",
        cascade="all, delete-orphan",
    )

    Actividades = relationship(
        "ActividadItinerario",
        back_populates="LugarInteres",
    )
    

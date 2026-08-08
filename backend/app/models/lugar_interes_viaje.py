from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class LugarInteresViaje(Base):
    __tablename__ = "LugaresInteresViajes"
    __table_args__ = (
        UniqueConstraint(
            "IdViaje",
            "IdLugarInteres",
            name="UQ_LugaresInteresViajes_IdViaje_IdLugarInteres",
        ),
    )

    IdLugarInteresViaje: Mapped[int] = mapped_column(primary_key=True)
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_LugaresInteresViajes_Viajes_IdViaje", ondelete="CASCADE"),
        nullable=False,
    )
    IdLugarInteres: Mapped[int] = mapped_column(
        ForeignKey(
            "LugaresInteres.IdLugarInteres",
            name="FK_LugaresInteresViajes_LugaresInteres_IdLugarInteres",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    Notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    IdUsuarioAlta: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_LugaresInteresViajes_Usuarios_IdUsuarioAlta"),
        nullable=False,
    )
    FechaAlta: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    Viaje = relationship("Viaje", back_populates="LugaresInteres")
    LugarInteres = relationship("LugarInteres", back_populates="Viajes")
    UsuarioAlta = relationship("Usuario")
    Actividades = relationship("ActividadItinerario", back_populates="LugarInteresViaje")

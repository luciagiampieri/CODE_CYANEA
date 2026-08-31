from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Notificacion(Base):
    __tablename__ = "Notificaciones"

    IdNotificacion: Mapped[int] = mapped_column(primary_key=True)

    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_Notificaciones_Usuarios_IdUsuario",
        ),
        nullable=False,
    )

    IdViaje: Mapped[int | None] = mapped_column(
        ForeignKey(
            "Viajes.IdViaje",
            name="FK_Notificaciones_Viajes_IdViaje",
        ),
        nullable=True,
    )

    Tipo: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    Titulo: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    Mensaje: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    Leida: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    Usuario = relationship(
        "Usuario",
        back_populates="Notificaciones",
    )

    Viaje = relationship(
        "Viaje",
        back_populates="Notificaciones",
    )
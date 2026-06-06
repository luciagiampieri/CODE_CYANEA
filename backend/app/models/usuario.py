from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Usuario(Base):
    __tablename__ = "Usuarios"

    IdUsuario: Mapped[int] = mapped_column(primary_key=True)
    Email: Mapped[str] = mapped_column(String(255), nullable=False)
    Nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    Apellido: Mapped[str] = mapped_column(String(100), nullable=False)
    NombreUsuario: Mapped[str] = mapped_column(String(50), nullable=False)
    FotoUrl: Mapped[str | None] = mapped_column(nullable=True)
    FechaAlta: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    FechaBaja: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    Activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    ViajesAdministrados = relationship(
        "Viaje",
        back_populates="Administrador",
        foreign_keys="Viaje.IdAdministrador",
    )
    Participaciones = relationship(
        "ParticipanteViaje",
        back_populates="Usuario",
        foreign_keys="ParticipanteViaje.IdUsuario",
    )
    InvitacionesEnviadas = relationship(
        "ParticipanteViaje",
        back_populates="UsuarioInvitador",
        foreign_keys="ParticipanteViaje.InvitadoPor",
    )

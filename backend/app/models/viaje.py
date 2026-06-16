from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Viaje(Base):
    __tablename__ = "Viajes"
    __table_args__ = (
        CheckConstraint(
            '"FechaFin" IS NULL OR "FechaInicio" IS NULL OR "FechaFin" >= "FechaInicio"',
            name="CK_Viajes_Fechas",
        ),
    )

    IdViaje: Mapped[int] = mapped_column(primary_key=True)
    Titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    Destino: Mapped[str] = mapped_column(String(150), nullable=False)
    Descripcion: Mapped[str | None] = mapped_column(nullable=True)
    FechaInicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    FechaFin: Mapped[date | None] = mapped_column(Date, nullable=True)
    IdEstadoViaje: Mapped[int] = mapped_column(
        ForeignKey("EstadosViajes.IdEstadoViaje", name="FK_Viajes_EstViajes_IdEstadoViaje"),
        nullable=False,
    )
    Moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")
    IdAdministrador: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_Viajes_Usuarios_IdAdministrador"),
        nullable=False,
    )
    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    FechaActualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    Administrador = relationship(
        "Usuario",
        back_populates="ViajesAdministrados",
        foreign_keys=[IdAdministrador],
    )
    EstadoViaje = relationship(
        "EstadoViaje",
        back_populates="Viajes",
        foreign_keys=[IdEstadoViaje],
    )
    Participantes = relationship(
        "ParticipanteViaje",
        back_populates="Viaje",
        cascade="all, delete-orphan",
        foreign_keys="ParticipanteViaje.IdViaje",
    )
    Invitaciones = relationship(
        "InvitacionViaje",
        back_populates="Viaje",
        cascade="all, delete-orphan",
        foreign_keys="InvitacionViaje.IdViaje",
    )
    Gastos = relationship(
        "Gasto",
        back_populates="Viaje",
        cascade="all, delete-orphan",
        foreign_keys="Gasto.IdViaje",
    )

    


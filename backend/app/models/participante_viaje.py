from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ParticipanteViaje(Base):
    __tablename__ = "ParticipantesViajes"
    __table_args__ = (
        UniqueConstraint("IdViaje", "IdUsuario", name="UX_ParticipantesViajes_IdViaje_IdUsuario"),
    )

    IdParticipanteViaje: Mapped[int] = mapped_column(primary_key=True)
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_ParticipantesViajes_Viajes_IdViaje"),
        nullable=False,
    )
    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_ParticipantesViajes_Usuarios_IdUsuario"),
        nullable=False,
    )
    IdRolParticipante: Mapped[int] = mapped_column(
        ForeignKey(
            "RolesParticipantes.IdRolParticipante",
            name="FK_PartViajes_RolesPart_IdRolParticipante",
        ),
        nullable=False,
    )
    IdEstadoParticipacion: Mapped[int] = mapped_column(
        ForeignKey(
            "EstadosParticipaciones.IdEstadoParticipacion",
            name="FK_PartViajes_EstPart_IdEstadoParticipacion",
        ),
        nullable=False,
    )
    FechaInvitacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    FechaRespuesta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    FechaIncorporacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    InvitadoPor: Mapped[int | None] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_ParticipantesViajes_Usuarios_InvitadoPor"),
        nullable=True,
    )

    Viaje = relationship(
        "Viaje",
        back_populates="Participantes",
        foreign_keys=[IdViaje],
    )
    Usuario = relationship(
        "Usuario",
        back_populates="Participaciones",
        foreign_keys=[IdUsuario],
    )
    RolParticipante = relationship(
        "RolParticipante",
        back_populates="Participaciones",
        foreign_keys=[IdRolParticipante],
    )
    EstadoParticipacion = relationship(
        "EstadoParticipacion",
        back_populates="Participaciones",
        foreign_keys=[IdEstadoParticipacion],
    )
    UsuarioInvitador = relationship(
        "Usuario",
        back_populates="InvitacionesEnviadas",
        foreign_keys=[InvitadoPor],
    )
    GastosPagados = relationship(
        "Gasto",
        back_populates="Pagador",
        foreign_keys="Gasto.IdPagador",
    )
    GastosDondeParticipa = relationship(
        "ParticipantesGastos",
        back_populates="ParticipanteViaje",
        foreign_keys="ParticipantesGastos.IdParticipanteViaje",
    )

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class InvitacionViaje(Base):
    __tablename__ = "InvitacionesViajes"
    __table_args__ = (
        UniqueConstraint("IdViaje", "EmailInvitado", name="UX_InvitacionesViajes_IdViaje_EmailInvitado"),
        UniqueConstraint("TokenInvitacion", name="UX_InvitacionesViajes_TokenInvitacion"),
    )

    IdInvitacionViaje: Mapped[int] = mapped_column(primary_key=True)
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_InvitacionesViajes_Viajes_IdViaje"),
        nullable=False,
    )
    EmailInvitado: Mapped[str] = mapped_column(String(255), nullable=False)
    NombreInvitado: Mapped[str | None] = mapped_column(String(150), nullable=True)
    TokenInvitacion: Mapped[str] = mapped_column(String(120), nullable=False)
    FechaInvitacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    FechaVencimiento: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    FechaAceptacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    IdEstadoInvitacion: Mapped[int] = mapped_column(
        ForeignKey(
            "EstadosInvitaciones.IdEstadoInvitacion",
            name="FK_InvitacionesViajes_EstadosInvitaciones_IdEstadoInvitacion",
        ),
        nullable=False,
    )
    InvitadoPor: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_InvitacionesViajes_Usuarios_InvitadoPor"),
        nullable=False,
    )
    IdUsuarioRegistrado: Mapped[int | None] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_InvitacionesViajes_Usuarios_IdUsuarioRegistrado"),
        nullable=True,
    )

    Viaje = relationship("Viaje", back_populates="Invitaciones")
    EstadoInvitacion = relationship("EstadoInvitacion", back_populates="Invitaciones")
    UsuarioInvitador = relationship(
        "Usuario",
        back_populates="InvitacionesExternasEnviadas",
        foreign_keys=[InvitadoPor],
    )
    UsuarioRegistrado = relationship(
        "Usuario",
        back_populates="InvitacionesExternasRecibidas",
        foreign_keys=[IdUsuarioRegistrado],
    )

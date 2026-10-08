from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.rol_sistema import ROL_VIAJERO


class Usuario(Base):
    __tablename__ = "Usuarios"

    IdUsuario: Mapped[int] = mapped_column(primary_key=True)
    Email: Mapped[str] = mapped_column(String(255), nullable=False)
    Nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    Apellido: Mapped[str] = mapped_column(String(100), nullable=False)
    NombreUsuario: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    HashedPassword: Mapped[str] = mapped_column("HashedPassword", String(255), nullable=False)
    GoogleSub: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    FacebookId: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ProveedorAutenticacion: Mapped[str] = mapped_column(
        String(30), nullable=False, default="local", server_default="local"
    )
    FotoUrl: Mapped[str | None] = mapped_column(nullable=True)
    FechaAlta: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    FechaBaja: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    Activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    IdRolSistema: Mapped[int] = mapped_column(
        ForeignKey("RolesSistema.IdRolSistema"),
        nullable=False,
        default=ROL_VIAJERO,
        server_default=str(ROL_VIAJERO),
    )
    ConsienteNotificacionesEmail: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    ConsienteNotificacionesPush: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Fecha en que se otorgó el consentimiento explícito de cada canal
    # (US 60, RNF-13). Se limpia cuando el usuario lo revoca.
    FechaConsentimientoNotificacionesEmail: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    FechaConsentimientoNotificacionesPush: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Consentimiento para procesar imágenes con un servicio externo de IA
    # (US 93, RNF-13 y RNF-33). Se pide la primera vez que se usa el escaneo.
    ConsienteProcesamientoIA: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    FechaConsentimientoIA: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ConsienteAsistenteIA: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    FechaConsentimientoAsistenteIA: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    RecibeEmailsNuevasActividades: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibeEmailsNuevaVotacion: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibeEmailsCambiosViaje: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibeEmailsNuevosGastos: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibeEmailsRecordatoriosDeuda: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibeEmailsRecordatoriosActividad: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibeEmailsRecordatoriosReserva: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibePushNuevasActividades: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibePushNuevaVotacion: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibePushCambiosViaje: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibePushNuevosGastos: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibePushRecordatoriosDeuda: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibePushRecordatoriosActividad: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    RecibePushRecordatoriosReserva: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

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
    InvitacionesExternasEnviadas = relationship(
        "InvitacionViaje",
        back_populates="UsuarioInvitador",
        foreign_keys="InvitacionViaje.InvitadoPor",
    )
    InvitacionesExternasRecibidas = relationship(
        "InvitacionViaje",
        back_populates="UsuarioRegistrado",
        foreign_keys="InvitacionViaje.IdUsuarioRegistrado",
    )
    EmailConfirmado: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    AceptaTerminos: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    FechaAceptacionTerminos: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    VersionTerminosAceptada: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    # Privacidad del perfil (US 61). Cada campo es "participantes" (visible
    # para los demás integrantes de los viajes compartidos) o "privado".
    VisibilidadNombre: Mapped[str] = mapped_column(
        String(20), nullable=False, default="participantes", server_default="participantes"
    )
    VisibilidadEmail: Mapped[str] = mapped_column(
        String(20), nullable=False, default="participantes", server_default="participantes"
    )
    VisibilidadFotoPerfil: Mapped[str] = mapped_column(
        String(20), nullable=False, default="participantes", server_default="participantes"
    )
    # Si otros viajeros pueden encontrar la cuenta buscando por nombre de
    # usuario para invitarla a un viaje.
    PermiteBusquedaPorUsuario: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    DocumentosSubidos = relationship(
        "DocumentoViaje",
        back_populates="UsuarioSubida"
    )
    Notificaciones = relationship(
        "Notificacion",
        back_populates="Usuario",
        cascade="all, delete-orphan",
    )
    TokensPush = relationship(
        "TokenPushUsuario",
        back_populates="Usuario",
        cascade="all, delete-orphan",
    )
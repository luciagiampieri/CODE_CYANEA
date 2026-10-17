from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.enlace_invitacion_viaje import EnlaceInvitacionViaje
from app.models.estado_invitacion import EstadoInvitacion
from app.models.invitacion_viaje import InvitacionViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.administracion_viajes import bloquear_viaje
from app.services.cupos_viajes import require_trip_capacity
from app.services.trip_access import require_trip_not_finished


def _error(codigo: str, mensaje: str, status: int = 410):
    return HTTPException(status, mensaje, headers={"X-Error-Code": codigo})


def validar_viaje(viaje: Viaje):
    require_trip_not_finished(viaje, "la incorporación de participantes")
    if viaje.EstadoViaje.Nombre != "activo" or not viaje.EstadoViaje.Activo:
        raise _error("INVITATION_TRIP_UNAVAILABLE", "Este viaje ya no admite participantes.", 409)


def enlace_activo(enlace: EnlaceInvitacionViaje | None) -> bool:
    if enlace is None or enlace.FechaRevocacion is not None:
        return False
    fecha = enlace.FechaVencimiento
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return fecha > datetime.now(timezone.utc)


def obtener_enlace(db: Session, id_viaje: int):
    return db.scalar(
        select(EnlaceInvitacionViaje)
        .where(
            EnlaceInvitacionViaje.IdViaje == id_viaje,
        )
        .execution_options(populate_existing=True)
    )


def gestionar_viaje(db: Session, id_viaje: int, usuario: Usuario):
    viaje = bloquear_viaje(db, id_viaje)
    if viaje.IdAdministrador != usuario.IdUsuario:
        raise HTTPException(403, "Solo el administrador puede gestionar el enlace de invitación.")
    validar_viaje(viaje)
    return viaje


def generar_enlace(db: Session, viaje: Viaje, usuario: Usuario, renovar: bool):
    enlace = obtener_enlace(db, viaje.IdViaje)
    if enlace_activo(enlace) and not renovar:
        return enlace
    ahora = datetime.now(timezone.utc)
    if enlace is None:
        enlace = EnlaceInvitacionViaje(IdViaje=viaje.IdViaje)
        db.add(enlace)
    enlace.TokenEnlace = token_urlsafe(32)
    enlace.IdUsuarioCreador = usuario.IdUsuario
    enlace.FechaCreacion = ahora
    enlace.FechaVencimiento = ahora + timedelta(days=7)
    enlace.FechaRevocacion = None
    db.commit()
    return enlace


def resolver_enlace(db: Session, token: str, bloquear: bool = False):
    if not 32 <= len(token) <= 120:
        raise _error("INVITATION_INVALID", "El enlace de invitación no es válido.", 404)
    enlace = db.scalar(
        select(EnlaceInvitacionViaje).where(EnlaceInvitacionViaje.TokenEnlace == token)
    )
    if enlace is None:
        raise _error(
            "INVITATION_INVALID", "El enlace de invitación no es válido o fue renovado.", 404
        )
    viaje = bloquear_viaje(db, enlace.IdViaje) if bloquear else db.get(Viaje, enlace.IdViaje)
    if bloquear:
        enlace = obtener_enlace(db, viaje.IdViaje)
        if enlace.TokenEnlace != token:
            raise _error(
                "INVITATION_INVALID", "El enlace fue renovado. Pedí el nuevo al organizador.", 404
            )
    if not enlace_activo(enlace):
        raise _error(
            "INVITATION_EXPIRED", "El enlace venció o fue revocado. Pedí uno nuevo al organizador."
        )
    validar_viaje(viaje)
    return viaje, enlace


def incorporarse(db: Session, token: str, usuario: Usuario):
    if not usuario.Activo or usuario.FechaBaja is not None or not usuario.EmailConfirmado:
        raise _error(
            "EMAIL_CONFIRMATION_REQUIRED", "Confirmá tu correo antes de unirte al viaje.", 403
        )
    viaje, enlace = resolver_enlace(db, token, bloquear=True)
    participacion = db.scalar(
        select(ParticipanteViaje)
        .where(
            ParticipanteViaje.IdViaje == viaje.IdViaje,
            ParticipanteViaje.IdUsuario == usuario.IdUsuario,
        )
        .execution_options(populate_existing=True)
    )
    if participacion is not None:
        estado = participacion.EstadoParticipacion.Nombre
        if estado == "aceptado":
            raise _error("ALREADY_TRIP_PARTICIPANT", "Ya formás parte de este viaje.", 409)
        if estado in {"expulsado", "cancelada"}:
            raise _error(
                "INVITATION_MEMBERSHIP_BLOCKED",
                "El organizador debe volver a invitarte personalmente a este viaje.",
                403,
            )
    require_trip_capacity(db, viaje)
    aceptado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado", EstadoParticipacion.Activo.is_(True)
        )
    )
    rol = db.scalar(
        select(RolParticipante).where(
            RolParticipante.Nombre == "participante", RolParticipante.Activo.is_(True)
        )
    )
    if aceptado is None or rol is None:
        raise HTTPException(500, "Faltan datos maestros del viaje.")
    ahora = datetime.now(timezone.utc)
    if participacion is None:
        participacion = ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            FechaInvitacion=ahora,
            InvitadoPor=viaje.IdAdministrador,
        )
        db.add(participacion)
    participacion.IdRolParticipante = rol.IdRolParticipante
    participacion.IdEstadoParticipacion = aceptado.IdEstadoParticipacion
    participacion.FechaRespuesta = ahora
    participacion.FechaIncorporacion = ahora
    participacion.FechaSalida = None
    participacion.IdAdministradorAlMomentoDeSalida = None
    # La invitación personal deja de estar pendiente al incorporarse por enlace.
    invitaciones = db.scalars(
        select(InvitacionViaje)
        .join(InvitacionViaje.EstadoInvitacion)
        .where(
            InvitacionViaje.IdViaje == viaje.IdViaje,
            func.lower(InvitacionViaje.EmailInvitado) == usuario.Email.strip().lower(),
            EstadoInvitacion.Nombre == "pendiente",
        )
    ).all()
    if invitaciones:
        estado_aceptada = db.scalar(
            select(EstadoInvitacion).where(
                EstadoInvitacion.Nombre == "aceptada",
                EstadoInvitacion.Activo.is_(True),
            )
        )
        if estado_aceptada is None:
            raise HTTPException(500, "Falta el estado maestro de invitación aceptada.")
        for invitacion in invitaciones:
            invitacion.IdEstadoInvitacion = estado_aceptada.IdEstadoInvitacion
            invitacion.IdUsuarioRegistrado = usuario.IdUsuario
            invitacion.FechaAceptacion = ahora
    viaje.FechaActualizacion = ahora
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "La participación cambió mientras te unías. Intentá nuevamente.")
    return viaje, False

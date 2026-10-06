"""Vincula invitaciones por mail (InvitacionesViajes) con la cuenta que se registra.

Cuando el admin invita a un correo que todavía no tiene cuenta, se guarda una
InvitacionViaje en estado 'pendiente'. Las invitaciones que ve el usuario en
Notificaciones salen de ParticipantesViajes (estado 'invitado'), así que al
crearse la cuenta hay que pasar esas invitaciones pendientes a participaciones.

Es idempotente: se puede llamar en el registro y en cada login sin duplicar nada.
También corrige a quienes ya se registraron antes de este arreglo (se vinculan
en su próximo login).
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.services.trip_access import is_trip_finished

logger = logging.getLogger(__name__)


def _vencida(invitacion: InvitacionViaje) -> bool:
    vencimiento = invitacion.FechaVencimiento
    if vencimiento is None:
        return False
    # Postgres devuelve fechas con zona horaria; SQLite (tests) sin zona.
    ahora = datetime.now(timezone.utc) if vencimiento.tzinfo else datetime.now()
    return vencimiento < ahora


def vincular_invitaciones_externas(db: Session, usuario: Usuario) -> int:
    """Convierte las invitaciones por mail pendientes de `usuario` en
    participaciones 'invitado'. Devuelve cuántas se vincularon.
    """
    email = (usuario.Email or "").strip().lower()
    if not email:
        return 0

    estado_pendiente = db.scalar(
        select(EstadoInvitacion).where(EstadoInvitacion.Nombre == "pendiente")
    )
    if estado_pendiente is None:
        return 0

    invitaciones = db.scalars(
        select(InvitacionViaje).where(
            InvitacionViaje.EmailInvitado == email,
            InvitacionViaje.IdEstadoInvitacion == estado_pendiente.IdEstadoInvitacion,
        )
    ).all()
    if not invitaciones:
        return 0

    estado_aceptada = db.scalar(
        select(EstadoInvitacion).where(EstadoInvitacion.Nombre == "aceptada")
    )
    estado_vencida = db.scalar(
        select(EstadoInvitacion).where(EstadoInvitacion.Nombre == "vencida")
    )
    estado_invitado = db.scalar(
        select(EstadoParticipacion).where(EstadoParticipacion.Nombre == "invitado")
    )
    rol_participante = db.scalar(
        select(RolParticipante).where(RolParticipante.Nombre == "participante")
    )
    if not all([estado_aceptada, estado_invitado, rol_participante]):
        logger.error("Faltan datos maestros para vincular invitaciones externas")
        return 0

    ahora = datetime.now()
    vinculadas = 0

    for invitacion in invitaciones:
        viaje = invitacion.Viaje

        if _vencida(invitacion):
            if estado_vencida is not None:
                invitacion.IdEstadoInvitacion = estado_vencida.IdEstadoInvitacion
            continue

        estado_viaje = viaje.EstadoViaje.Nombre if viaje.EstadoViaje is not None else None
        if estado_viaje != "activo" or is_trip_finished(viaje):
            continue

        # Queda registrado a qué cuenta corresponde la invitación por mail.
        invitacion.IdUsuarioRegistrado = usuario.IdUsuario
        invitacion.IdEstadoInvitacion = estado_aceptada.IdEstadoInvitacion
        invitacion.FechaAceptacion = ahora

        if viaje.IdAdministrador == usuario.IdUsuario:
            continue

        existente = db.scalar(
            select(ParticipanteViaje).where(
                ParticipanteViaje.IdViaje == viaje.IdViaje,
                ParticipanteViaje.IdUsuario == usuario.IdUsuario,
            )
        )
        if existente is not None:
            # Ya tiene una participación (p. ej. lo invitaron también por usuario).
            continue

        db.add(
            ParticipanteViaje(
                IdViaje=viaje.IdViaje,
                IdUsuario=usuario.IdUsuario,
                IdRolParticipante=rol_participante.IdRolParticipante,
                IdEstadoParticipacion=estado_invitado.IdEstadoParticipacion,
                InvitadoPor=invitacion.InvitadoPor,
                FechaInvitacion=invitacion.FechaInvitacion or ahora,
            )
        )
        vinculadas += 1

    db.commit()

    if vinculadas:
        logger.info(
            "Invitaciones externas vinculadas a la cuenta",
            extra={"user_id": usuario.IdUsuario, "cantidad": vinculadas},
        )
    return vinculadas


def vincular_invitaciones_externas_seguro(db: Session, usuario: Usuario) -> None:
    """Versión que nunca rompe el registro/login si algo falla."""
    try:
        vincular_invitaciones_externas(db, usuario)
    except Exception:
        db.rollback()
        logger.exception(
            "No se pudieron vincular las invitaciones externas",
            extra={"user_id": usuario.IdUsuario},
        )
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.estado_invitacion import EstadoInvitacion
from app.models.invitacion_viaje import InvitacionViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.mail.service import MailService
from app.services.notifications.invitation_email_sender import (
    InvitationEmailPayload,
    InvitationEmailSender,
)
from app.services.privacidad import nombre_para_otros

logger = logging.getLogger(__name__)

DIAS_VIGENCIA = 7
EMAIL_INVITATION_LIMIT_REACHED = "EMAIL_INVITATION_LIMIT_REACHED"
INVITATION_ALREADY_PENDING = "INVITATION_ALREADY_PENDING"
INVITATION_EMAIL_FAILED = "INVITATION_EMAIL_FAILED"


def _zona():
    try:
        return ZoneInfo(settings.trip_status_timezone)
    except ZoneInfoNotFoundError:
        return timezone(timedelta(hours=-3))


def esta_vencida(invitacion: InvitacionViaje) -> bool:
    vencimiento = invitacion.FechaVencimiento
    if vencimiento is None:
        return False
    ahora = datetime.now(timezone.utc) if vencimiento.tzinfo else datetime.now()
    return vencimiento < ahora


def validar_cupo_diario(db: Session, id_viaje: int | None, cantidad: int = 1) -> None:
    limite = settings.email_invitations_daily_limit
    enviadas = 0
    if id_viaje is not None:
        inicio_del_dia = datetime.now(_zona()).replace(hour=0, minute=0, second=0, microsecond=0)
        enviadas = db.scalar(
            select(func.count())
            .select_from(InvitacionViaje)
            .where(
                InvitacionViaje.IdViaje == id_viaje,
                InvitacionViaje.FechaInvitacion >= inicio_del_dia.astimezone(timezone.utc),
            )
        ) or 0
    if enviadas + cantidad > limite:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Alcanzaste el límite de {limite} invitaciones por correo por día en este viaje. "
                "Podés volver a intentarlo mañana."
            ),
            headers={"X-Error-Code": EMAIL_INVITATION_LIMIT_REACHED},
        )


def preparar_invitacion(
    db: Session,
    viaje: Viaje,
    email: str,
    invitador: Usuario,
    estado_pendiente: EstadoInvitacion,
) -> InvitacionViaje:
    invitacion = db.scalar(
        select(InvitacionViaje).where(
            InvitacionViaje.IdViaje == viaje.IdViaje,
            func.lower(InvitacionViaje.EmailInvitado) == email,
        )
    )
    if (
        invitacion is not None
        and invitacion.IdEstadoInvitacion == estado_pendiente.IdEstadoInvitacion
        and not esta_vencida(invitacion)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ese correo ya tiene una invitación pendiente",
            headers={"X-Error-Code": INVITATION_ALREADY_PENDING},
        )

    validar_cupo_diario(db, viaje.IdViaje)

    ahora = datetime.now(timezone.utc)
    if invitacion is None:
        invitacion = InvitacionViaje(IdViaje=viaje.IdViaje, EmailInvitado=email)
        db.add(invitacion)
    invitacion.NombreInvitado = None
    invitacion.TokenInvitacion = token_urlsafe(32)
    invitacion.FechaInvitacion = ahora
    invitacion.FechaVencimiento = ahora + timedelta(days=DIAS_VIGENCIA)
    invitacion.FechaAceptacion = None
    invitacion.IdEstadoInvitacion = estado_pendiente.IdEstadoInvitacion
    invitacion.InvitadoPor = invitador.IdUsuario
    invitacion.IdUsuarioRegistrado = None
    invitacion.VencidaPorFinViaje = False
    db.flush()
    return invitacion


def payload_invitacion(
    viaje: Viaje, invitacion: InvitacionViaje, invitador: Usuario
) -> InvitationEmailPayload:
    return InvitationEmailPayload(
        to_email=invitacion.EmailInvitado,
        trip_title=viaje.Titulo,
        trip_destination=", ".join(
            f"{rel.Destino.Nombre}, {rel.Destino.Pais}" for rel in viaje.Destinos
        ),
        inviter_name=nombre_para_otros(invitador) or invitador.NombreUsuario,
        invitation_token=invitacion.TokenInvitacion,
        expiration_at=invitacion.FechaVencimiento.astimezone(_zona()),
    )


async def enviar_invitacion(
    db: Session, mail_service: MailService, payload: InvitationEmailPayload
) -> None:
    try:
        await asyncio.to_thread(InvitationEmailSender(mail_service).send, payload)
    except Exception:
        db.rollback()
        logger.exception("No se pudo enviar el correo de invitación", extra={"email": payload.to_email})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No pudimos enviar la invitación por correo. Intentá nuevamente.",
            headers={"X-Error-Code": INVITATION_EMAIL_FAILED},
        )
    db.commit()
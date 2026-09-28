import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.estado_participacion import EstadoParticipacion
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.token_push_usuario import TokenPushUsuario
from app.models.usuario import Usuario
from app.services.notifications.push import ExpoPushClient
from app.services.notifications.service import NotificationType, get_notification_service
from app.services.websocket_manager import manager


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class TripNotificationEvent:
    notification_type: NotificationType
    tipo: str
    titulo: str
    mensaje: str
    id_viaje: int
    id_usuario_actor: int | None = None
    data: dict[str, Any] = field(default_factory=dict)


async def dispatch_trip_notification(
    db: Session,
    event: TripNotificationEvent,
    push_client: ExpoPushClient | None = None,
) -> list[Notificacion]:
    """Registra notificaciones de viaje y despacha push sin bloquear el flujo principal."""

    try:
        recipients = _load_trip_recipients(db, event.id_viaje, event.id_usuario_actor)
        if not recipients:
            return []

        notificaciones = [
            Notificacion(
                IdUsuario=recipient.IdUsuario,
                IdViaje=event.id_viaje,
                Tipo=event.tipo,
                Titulo=event.titulo,
                Mensaje=event.mensaje,
            )
            for recipient in recipients
        ]
        db.add_all(notificaciones)
        db.commit()
        for notificacion in notificaciones:
            db.refresh(notificacion)

        await _broadcast_in_app_notifications(notificaciones)
        try:
            await _send_push_notifications(db, event, recipients, push_client)
        except Exception:
            logger.exception("No se pudo enviar la notificacion push del viaje %s", event.id_viaje)
            db.rollback()

        return notificaciones
    except Exception:
        logger.exception("No se pudo registrar la notificacion del viaje %s", event.id_viaje)
        db.rollback()
        return []


def _load_trip_recipients(
    db: Session,
    id_viaje: int,
    id_usuario_actor: int | None,
) -> list[Usuario]:
    query = (
        select(Usuario)
        .join(ParticipanteViaje, ParticipanteViaje.IdUsuario == Usuario.IdUsuario)
        .join(
            EstadoParticipacion,
            EstadoParticipacion.IdEstadoParticipacion == ParticipanteViaje.IdEstadoParticipacion,
        )
        .options(selectinload(Usuario.TokensPush))
        .where(
            ParticipanteViaje.IdViaje == id_viaje,
            EstadoParticipacion.Nombre == "aceptado",
            Usuario.Activo.is_(True),
        )
    )
    if id_usuario_actor is not None:
        query = query.where(Usuario.IdUsuario != id_usuario_actor)

    return list(db.scalars(query).unique().all())


async def _broadcast_in_app_notifications(notificaciones: list[Notificacion]) -> None:
    for notificacion in notificaciones:
        await manager.broadcast_to_user(
            notificacion.IdUsuario,
            {
                "tipo": "nueva_notificacion",
                "notificacion": {
                    "id": notificacion.IdNotificacion,
                    "viajeId": notificacion.IdViaje,
                    "tipo": notificacion.Tipo,
                    "titulo": notificacion.Titulo,
                    "mensaje": notificacion.Mensaje,
                    "leida": notificacion.Leida,
                    "fechaCreacion": notificacion.FechaCreacion,
                },
            },
        )


async def _send_push_notifications(
    db: Session,
    event: TripNotificationEvent,
    recipients: list[Usuario],
    push_client: ExpoPushClient | None,
) -> None:
    notification_service = get_notification_service()
    eligible_ids = {
        recipient.IdUsuario
        for recipient in recipients
        if notification_service.can_send_push(recipient, event.notification_type)[0]
    }
    if not eligible_ids:
        return

    tokens = list(
        db.scalars(
            select(TokenPushUsuario).where(
                TokenPushUsuario.IdUsuario.in_(eligible_ids),
                TokenPushUsuario.Activo.is_(True),
            )
        ).all()
    )
    if not tokens:
        return

    messages = [
        {
            "to": token.Token,
            "title": event.titulo,
            "body": event.mensaje,
            "sound": "default",
            "channelId": "cyanea-trips",
            "data": {
                "tipo": event.tipo,
                "notificationType": event.notification_type.value,
                "tripId": event.id_viaje,
                **event.data,
            },
        }
        for token in tokens
    ]

    client = push_client or ExpoPushClient()
    tickets = await client.send_messages(messages)
    invalid_tokens = {
        ticket.token
        for ticket in tickets
        if ticket.error == "DeviceNotRegistered"
    }
    if not invalid_tokens:
        return

    fecha_baja = datetime.now(timezone.utc)
    for token in tokens:
        if token.Token in invalid_tokens:
            token.Activo = False
            token.FechaBaja = fecha_baja
    db.commit()

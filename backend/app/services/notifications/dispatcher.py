import asyncio
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
from app.models.viaje import Viaje
from app.services.notifications.push import ExpoPushClient
from app.services.notifications.service import (
    NotificationMessage,
    NotificationType,
    get_notification_service,
)
from app.services.websocket_manager import manager


logger = logging.getLogger(__name__)

_EMAIL_TEMPLATE_HTML = "trip_event_notification.html"
_EMAIL_TEMPLATE_TEXT = "trip_event_notification.txt"

# Etiqueta que encabeza el correo según el tipo de notificación (US 60).
_EMAIL_EVENT_LABELS = {
    NotificationType.NUEVA_ACTIVIDAD: "Nueva actividad",
    NotificationType.CAMBIO_VIAJE: "Cambio en el viaje",
    NotificationType.NUEVO_GASTO: "Nuevo gasto",
    NotificationType.NUEVA_VOTACION: "Nueva votación",
    NotificationType.RECORDATORIO_DEUDA: "Deuda pendiente",
    NotificationType.RECORDATORIO_ACTIVIDAD: "Actividad próxima",
    NotificationType.RECORDATORIO_RESERVA: "Vencimiento de reserva",
    NotificationType.PARTICIPANTE_EXPULSADO: "Cambio en el viaje",
    NotificationType.INVITACION_CANCELADA: "Invitación cancelada",
}


@dataclass(slots=True)
class TripNotificationEvent:
    notification_type: NotificationType
    tipo: str
    titulo: str
    mensaje: str
    id_viaje: int
    id_usuario_actor: int | None = None
    data: dict[str, Any] = field(default_factory=dict)
    # Si es False, el push no incluye tripId y al tocarlo no se abre el viaje
    # (por ejemplo, cuando el destinatario ya no tiene acceso a ese viaje).
    abre_viaje: bool = True


async def dispatch_trip_notification(
    db: Session,
    event: TripNotificationEvent,
    push_client: ExpoPushClient | None = None,
) -> list[Notificacion]:
    """Registra notificaciones de viaje y despacha push sin bloquear el flujo principal."""

    try:
        recipients = _load_trip_recipients(db, event.id_viaje, event.id_usuario_actor)
    except Exception:
        logger.exception("No se pudieron obtener los destinatarios del viaje %s", event.id_viaje)
        return []

    return await _dispatch_to_recipients(db, event, recipients, push_client)


async def dispatch_user_notification(
    db: Session,
    event: TripNotificationEvent,
    recipients: list[Usuario],
    push_client: ExpoPushClient | None = None,
) -> list[Notificacion]:
    """Igual que `dispatch_trip_notification`, pero para destinatarios puntuales.

    Se usa cuando el aviso no es para todo el grupo del viaje, por ejemplo
    al cancelar la invitación de un usuario que todavía no forma parte del viaje.
    """

    return await _dispatch_to_recipients(
        db,
        event,
        [recipient for recipient in recipients if recipient is not None and recipient.Activo],
        push_client,
    )


async def _dispatch_to_recipients(
    db: Session,
    event: TripNotificationEvent,
    recipients: list[Usuario],
    push_client: ExpoPushClient | None,
) -> list[Notificacion]:
    try:
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

        try:
            await _send_email_notifications(db, event, recipients)
        except Exception:
            logger.exception("No se pudo enviar la notificacion por email del viaje %s", event.id_viaje)

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
                **({"tripId": event.id_viaje} if event.abre_viaje else {}),
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


async def _send_email_notifications(
    db: Session,
    event: TripNotificationEvent,
    recipients: list[Usuario],
) -> None:
    """Envía el aviso por correo a quienes dieron consentimiento y tienen la
    preferencia activa para este tipo de evento (US 60, RNF-13).

    La validación y el armado de cada correo se hacen acá, con la sesión de
    base de datos; el envío SMTP, que es bloqueante, se hace en un hilo aparte
    para no frenar el event loop.
    """

    notification_service = get_notification_service()
    viaje = db.get(Viaje, event.id_viaje)
    trip_title = viaje.Titulo if viaje is not None else ""
    trip_destination = _describe_destinations(viaje)
    event_label = _EMAIL_EVENT_LABELS.get(event.notification_type, "Novedad en el viaje")

    prepared_emails = []
    for recipient in recipients:
        prepared = notification_service.prepare_email(
            NotificationMessage(
                notification_type=event.notification_type,
                recipient=recipient,
                subject=event.titulo,
                trip_id=event.id_viaje if event.abre_viaje else None,
                template_name=_EMAIL_TEMPLATE_HTML,
                text_template_name=_EMAIL_TEMPLATE_TEXT,
                context={
                    "recipient_name": recipient.Nombre,
                    "trip_title": trip_title,
                    "trip_destination": trip_destination,
                    "event_label": event_label,
                    "event_title": event.titulo,
                    "event_message": event.mensaje,
                },
            )
        )
        if prepared is not None:
            prepared_emails.append(prepared)

    if not prepared_emails:
        return

    await asyncio.to_thread(_deliver_emails, notification_service, prepared_emails)


def _deliver_emails(notification_service, prepared_emails: list[dict]) -> None:
    for prepared in prepared_emails:
        try:
            notification_service.deliver_email(prepared)
        except Exception:
            logger.exception(
                "No se pudo enviar un correo de notificacion",
                extra={"subject": prepared.get("subject")},
            )


def _describe_destinations(viaje: Viaje | None) -> str:
    if viaje is None:
        return ""
    try:
        return ", ".join(
            f"{relacion.Destino.Nombre}, {relacion.Destino.Pais}"
            for relacion in viaje.Destinos
            if relacion.Destino is not None
        )
    except Exception:
        logger.exception("No se pudieron leer los destinos del viaje %s", viaje.IdViaje)
        return ""

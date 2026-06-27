import logging
from dataclasses import dataclass, field
from enum import StrEnum
from functools import lru_cache

from app.core.config import settings
from app.models.usuario import Usuario
from app.services.mail import get_mail_service
from app.services.mail.service import MailService


logger = logging.getLogger(__name__)


class NotificationType(StrEnum):
    NUEVA_VOTACION = "nueva_votacion"
    CAMBIO_VIAJE = "cambio_viaje"
    RECORDATORIO_DEUDA = "recordatorio_deuda"
    RECORDATORIO_RESERVA = "recordatorio_reserva"


@dataclass(slots=True)
class NotificationDispatchResult:
    sent: bool
    reason: str | None = None


@dataclass(slots=True)
class NotificationMessage:
    notification_type: NotificationType
    recipient: Usuario
    subject: str
    trip_id: int | None = None
    template_name: str | None = None
    text_template_name: str | None = None
    html: str | None = None
    text: str | None = None
    reply_to: str | None = None
    context: dict[str, object] = field(default_factory=dict)


class NotificationService:
    _notification_preferences = {
        NotificationType.NUEVA_VOTACION: "RecibeEmailsNuevaVotacion",
        NotificationType.CAMBIO_VIAJE: "RecibeEmailsCambiosViaje",
        NotificationType.RECORDATORIO_DEUDA: "RecibeEmailsRecordatoriosDeuda",
        NotificationType.RECORDATORIO_RESERVA: "RecibeEmailsRecordatoriosReserva",
    }

    def __init__(self, mail_service: MailService) -> None:
        self.mail_service = mail_service

    def can_send_email(
        self,
        recipient: Usuario,
        notification_type: NotificationType,
    ) -> tuple[bool, str | None]:
        if not settings.mail_enabled:
            return False, "mail_disabled"
        if not recipient.Activo:
            return False, "user_inactive"
        if not recipient.EmailConfirmado:
            return False, "email_unconfirmed"
        if not recipient.ConsienteNotificacionesEmail:
            return False, "email_consent_missing"

        preference_attr = self._notification_preferences[notification_type]
        if not getattr(recipient, preference_attr, False):
            return False, "notification_preference_disabled"

        return True, None

    def build_trip_url(self, trip_id: int) -> str:
        return f"{settings.mail_frontend_base_url.rstrip('/')}/viajes/{trip_id}"

    def send_email(self, message: NotificationMessage) -> NotificationDispatchResult:
        can_send, reason = self.can_send_email(message.recipient, message.notification_type)
        if not can_send:
            logger.info(
                "Notificacion omitida",
                extra={
                    "user_id": message.recipient.IdUsuario,
                    "notification_type": message.notification_type.value,
                    "reason": reason,
                },
            )
            return NotificationDispatchResult(sent=False, reason=reason)

        context = dict(message.context)
        context.setdefault("app_name", settings.app_name)
        context.setdefault("notification_type", message.notification_type.value)
        if message.trip_id is not None:
            context.setdefault("tripId", message.trip_id)
            context.setdefault("trip_url", self.build_trip_url(message.trip_id))

        if message.template_name:
            self.mail_service.send_template(
                to=[message.recipient.Email],
                subject=message.subject,
                template_name=message.template_name,
                text_template_name=message.text_template_name,
                context=context,
                reply_to=message.reply_to,
            )
            return NotificationDispatchResult(sent=True)

        if message.html:
            self.mail_service.send_html(
                to=[message.recipient.Email],
                subject=message.subject,
                html=message.html,
                text=message.text,
                reply_to=message.reply_to,
            )
            return NotificationDispatchResult(sent=True)

        raise ValueError("Debes enviar template_name o html para despachar la notificacion")


@lru_cache
def get_notification_service() -> NotificationService:
    return NotificationService(mail_service=get_mail_service())

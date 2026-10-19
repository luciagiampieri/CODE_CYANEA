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
    NUEVA_ACTIVIDAD = "nueva_actividad"
    NUEVA_VOTACION = "nueva_votacion"
    CAMBIO_VIAJE = "cambio_viaje"
    NUEVO_GASTO = "nuevo_gasto"
    RECORDATORIO_DEUDA = "recordatorio_deuda"
    RECORDATORIO_ACTIVIDAD = "recordatorio_actividad"
    RECORDATORIO_RESERVA = "recordatorio_reserva"
    PARTICIPANTE_EXPULSADO = "participante_expulsado"
    INVITACION_CANCELADA = "invitacion_cancelada"
    GASTO_MODIFICADO = "gasto_modificado"
    LIQUIDACION_ACTUALIZADA = "liquidacion_actualizada"
    TRANSFERENCIA_INFORMADA = "transferencia_informada"
    TRANSFERENCIA_RECHAZADA = "transferencia_rechazada"
    # Tareas del checklist creadas con "Recordármelo" (comprar entradas o reservar).
    TAREA_RESERVA_ENTRADAS = "tarea_reserva_entradas"
    # US 103: el viaje finalizó; invita a revisar la liquidación.
    VIAJE_FINALIZADO = "viaje_finalizado"


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
        NotificationType.NUEVA_ACTIVIDAD: "RecibeEmailsNuevasActividades",
        NotificationType.NUEVA_VOTACION: "RecibeEmailsNuevaVotacion",
        NotificationType.CAMBIO_VIAJE: "RecibeEmailsCambiosViaje",
        NotificationType.NUEVO_GASTO: "RecibeEmailsNuevosGastos",
        NotificationType.GASTO_MODIFICADO: "RecibeEmailsNuevosGastos",
        NotificationType.RECORDATORIO_DEUDA: "RecibeEmailsRecordatoriosDeuda",
        # Cambios de a quién transferir: misma preferencia que los recordatorios de deuda.
        NotificationType.LIQUIDACION_ACTUALIZADA: "RecibeEmailsRecordatoriosDeuda",
        NotificationType.TRANSFERENCIA_INFORMADA: "RecibeEmailsRecordatoriosDeuda",
        NotificationType.TRANSFERENCIA_RECHAZADA: "RecibeEmailsRecordatoriosDeuda",
        NotificationType.RECORDATORIO_ACTIVIDAD: "RecibeEmailsRecordatoriosActividad",
        NotificationType.RECORDATORIO_RESERVA: "RecibeEmailsRecordatoriosReserva",
        # Misma preferencia que los recordatorios de reservas.
        NotificationType.TAREA_RESERVA_ENTRADAS: "RecibeEmailsRecordatoriosReserva",
        NotificationType.PARTICIPANTE_EXPULSADO: "RecibeEmailsCambiosViaje",
        NotificationType.INVITACION_CANCELADA: "RecibeEmailsCambiosViaje",
        # Invita a saldar deudas: misma preferencia que los recordatorios de deuda.
        NotificationType.VIAJE_FINALIZADO: "RecibeEmailsRecordatoriosDeuda",
    }
    _push_preferences = {
        NotificationType.NUEVA_ACTIVIDAD: "RecibePushNuevasActividades",
        NotificationType.NUEVA_VOTACION: "RecibePushNuevaVotacion",
        NotificationType.CAMBIO_VIAJE: "RecibePushCambiosViaje",
        NotificationType.NUEVO_GASTO: "RecibePushNuevosGastos",
        NotificationType.GASTO_MODIFICADO: "RecibePushNuevosGastos",
        NotificationType.RECORDATORIO_DEUDA: "RecibePushRecordatoriosDeuda",
        NotificationType.LIQUIDACION_ACTUALIZADA: "RecibePushRecordatoriosDeuda",
        NotificationType.TRANSFERENCIA_INFORMADA: "RecibePushRecordatoriosDeuda",
        NotificationType.TRANSFERENCIA_RECHAZADA: "RecibePushRecordatoriosDeuda",
        NotificationType.RECORDATORIO_ACTIVIDAD: "RecibePushRecordatoriosActividad",
        NotificationType.RECORDATORIO_RESERVA: "RecibePushRecordatoriosReserva",
        NotificationType.TAREA_RESERVA_ENTRADAS: "RecibePushRecordatoriosReserva",
        NotificationType.PARTICIPANTE_EXPULSADO: "RecibePushCambiosViaje",
        NotificationType.INVITACION_CANCELADA: "RecibePushCambiosViaje",
        NotificationType.VIAJE_FINALIZADO: "RecibePushRecordatoriosDeuda",
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

    def can_send_push(
        self,
        recipient: Usuario,
        notification_type: NotificationType,
    ) -> tuple[bool, str | None]:
        if not recipient.Activo:
            return False, "user_inactive"
        if not recipient.EmailConfirmado:
            return False, "email_unconfirmed"
        if not recipient.ConsienteNotificacionesPush:
            return False, "push_consent_missing"

        preference_attr = self._push_preferences[notification_type]
        if not getattr(recipient, preference_attr, False):
            return False, "push_preference_disabled"

        return True, None

    def build_trip_url(self, trip_id: int) -> str:
        return f"{settings.mail_frontend_base_url.rstrip('/')}/viajes/{trip_id}"

    def prepare_email(self, message: NotificationMessage) -> dict[str, object] | None:
        """Valida consentimiento y preferencia y arma los datos del correo.

        Devuelve None si el correo no debe enviarse. Lee los atributos del
        destinatario en el hilo que llama, de modo que el envío posterior
        (`deliver_email`) no necesita tocar la sesión de base de datos.
        """
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
            return None

        if not message.template_name and not message.html:
            raise ValueError("Debes enviar template_name o html para despachar la notificacion")

        context = dict(message.context)
        context.setdefault("app_name", settings.app_name)
        context.setdefault("notification_type", message.notification_type.value)
        if message.trip_id is not None:
            context.setdefault("tripId", message.trip_id)
            context.setdefault("trip_url", self.build_trip_url(message.trip_id))

        return {
            "to": [message.recipient.Email],
            "subject": message.subject,
            "template_name": message.template_name,
            "text_template_name": message.text_template_name,
            "html": message.html,
            "text": message.text,
            "reply_to": message.reply_to,
            "context": context,
        }

    def deliver_email(self, prepared: dict[str, object]) -> None:
        if prepared["template_name"]:
            self.mail_service.send_template(
                to=prepared["to"],
                subject=prepared["subject"],
                template_name=prepared["template_name"],
                text_template_name=prepared["text_template_name"],
                context=prepared["context"],
                reply_to=prepared["reply_to"],
            )
            return

        self.mail_service.send_html(
            to=prepared["to"],
            subject=prepared["subject"],
            html=prepared["html"],
            text=prepared["text"],
            reply_to=prepared["reply_to"],
        )

    def send_email(self, message: NotificationMessage) -> NotificationDispatchResult:
        prepared = self.prepare_email(message)
        if prepared is None:
            _, reason = self.can_send_email(message.recipient, message.notification_type)
            return NotificationDispatchResult(sent=False, reason=reason)

        self.deliver_email(prepared)
        return NotificationDispatchResult(sent=True)


@lru_cache
def get_notification_service() -> NotificationService:
    return NotificationService(mail_service=get_mail_service())
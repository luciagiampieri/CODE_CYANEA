import logging
from functools import lru_cache

from app.core.config import settings
from app.services.mail.base import MailProvider
from app.services.mail.schemas import MailMessage
from app.services.mail.smtp import SmtpMailProvider
from app.services.mail.templates import render_template


logger = logging.getLogger(__name__)


class MailService:
    def __init__(self, provider: MailProvider) -> None:
        self.provider = provider

    def send_html(
        self,
        *,
        to: list[str],
        subject: str,
        html: str,
        text: str | None = None,
        reply_to: str | None = None,
    ) -> bool:
        if not settings.mail_enabled:
            logger.info("MAIL_ENABLED=false. Se omite envio de correo", extra={"to": to, "subject": subject})
            return False

        message = MailMessage(
            to=to,
            subject=subject,
            html=html,
            text=text,
            reply_to=reply_to,
        )
        self.provider.send(message)
        logger.info("Correo enviado", extra={"to": to, "subject": subject})
        return True

    def send_template(
        self,
        *,
        to: list[str],
        subject: str,
        template_name: str,
        context: dict[str, object],
        text_template_name: str | None = None,
        reply_to: str | None = None,
    ) -> bool:
        html = render_template(template_name, context)
        text = render_template(text_template_name, context) if text_template_name else None
        return self.send_html(
            to=to,
            subject=subject,
            html=html,
            text=text,
            reply_to=reply_to,
        )


@lru_cache
def get_mail_service() -> MailService:
    provider_name = settings.mail_provider.lower().strip()
    if provider_name != "smtp":
        raise ValueError(f"Proveedor de mail no soportado: {settings.mail_provider}")
    return MailService(provider=SmtpMailProvider())

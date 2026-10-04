import requests

from app.core.config import settings
from app.services.mail.base import MailProvider
from app.services.mail.schemas import MailMessage


class BrevoMailProvider(MailProvider):
    URL = "https://api.brevo.com/v3/smtp/email"

    def send(self, message: MailMessage) -> None:
        payload = {
            "sender": {"name": settings.mail_from_name, "email": settings.mail_from_email},
            "to": [{"email": e} for e in message.to],
            "subject": message.subject,
            "htmlContent": message.html,
        }
        if message.text:
            payload["textContent"] = message.text
        if message.cc:
            payload["cc"] = [{"email": e} for e in message.cc]
        if message.bcc:
            payload["bcc"] = [{"email": e} for e in message.bcc]
        reply_to = message.reply_to or settings.mail_reply_to
        if reply_to:
            payload["replyTo"] = {"email": reply_to}

        response = requests.post(
            self.URL,
            json=payload,
            headers={"api-key": settings.brevo_api_key or "", "accept": "application/json"},
            timeout=15,
        )
        response.raise_for_status()
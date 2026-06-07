import smtplib
from email.message import EmailMessage

from app.core.config import settings
from app.services.mail.base import MailProvider
from app.services.mail.schemas import MailMessage


class SmtpMailProvider(MailProvider):
    def send(self, message: MailMessage) -> None:
        email_message = EmailMessage()
        from_header = f"{settings.mail_from_name} <{settings.mail_from_email}>"

        email_message["Subject"] = message.subject
        email_message["From"] = from_header
        email_message["To"] = ", ".join(message.to)
        if message.cc:
            email_message["Cc"] = ", ".join(message.cc)
        if message.reply_to:
            email_message["Reply-To"] = message.reply_to
        elif settings.mail_reply_to:
            email_message["Reply-To"] = settings.mail_reply_to

        plain_text = message.text or "Este correo requiere un cliente compatible con HTML."
        email_message.set_content(plain_text)
        email_message.add_alternative(message.html, subtype="html")

        recipients = [*message.to, *message.cc, *message.bcc]

        with smtplib.SMTP(settings.mail_host, settings.mail_port, timeout=15) as smtp:
            if settings.mail_use_tls:
                smtp.starttls()
            if settings.mail_username and settings.mail_password:
                smtp.login(settings.mail_username, settings.mail_password)
            smtp.send_message(email_message, to_addrs=recipients)

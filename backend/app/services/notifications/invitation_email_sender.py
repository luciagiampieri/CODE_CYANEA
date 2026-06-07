from dataclasses import dataclass
from datetime import datetime

from app.core.config import settings
from app.services.mail.service import MailService


@dataclass(slots=True)
class InvitationEmailPayload:
    to_email: str
    trip_title: str
    trip_destination: str
    inviter_name: str
    invitation_token: str
    expiration_at: datetime


class InvitationEmailSender:
    def __init__(self, mail_service: MailService) -> None:
        self.mail_service = mail_service

    def send(self, payload: InvitationEmailPayload) -> bool:
        accept_url = f"{settings.mail_frontend_base_url.rstrip('/')}/invitaciones/{payload.invitation_token}"
        context = {
            "trip_title": payload.trip_title,
            "trip_destination": payload.trip_destination,
            "inviter_name": payload.inviter_name,
            "accept_url": accept_url,
            "expiration_at": payload.expiration_at.strftime("%d/%m/%Y %H:%M"),
        }
        return self.mail_service.send_template(
            to=[payload.to_email],
            subject=f"Invitacion a {payload.trip_title} en Cyanea",
            template_name="invite_trip.html",
            text_template_name="invite_trip.txt",
            context=context,
        )

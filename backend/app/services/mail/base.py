from abc import ABC, abstractmethod

from app.services.mail.schemas import MailMessage


class MailProvider(ABC):
    @abstractmethod
    def send(self, message: MailMessage) -> None:
        raise NotImplementedError

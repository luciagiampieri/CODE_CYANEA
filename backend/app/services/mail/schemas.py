from dataclasses import dataclass, field


@dataclass(slots=True)
class MailMessage:
    to: list[str]
    subject: str
    html: str
    text: str | None = None
    reply_to: str | None = None
    cc: list[str] = field(default_factory=list)
    bcc: list[str] = field(default_factory=list)

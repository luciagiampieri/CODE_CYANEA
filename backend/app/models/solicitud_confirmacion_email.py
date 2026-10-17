from datetime import datetime

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SolicitudConfirmacionEmail(Base):
    __tablename__ = "SolicitudesConfirmacionEmail"
    __table_args__ = (
        Index("IX_SolicitudesConfirmacionEmail_Email_Fecha", "EmailHash", "Fecha"),
        Index("IX_SolicitudesConfirmacionEmail_Ip_Fecha", "Ip", "Fecha"),
    )

    IdSolicitud: Mapped[int] = mapped_column(primary_key=True)
    EmailHash: Mapped[str] = mapped_column(String(64), nullable=False)
    Ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    Fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

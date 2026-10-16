from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _ahora_utc() -> datetime:
    return datetime.now(timezone.utc)


class SolicitudIA(Base):
    __tablename__ = "SolicitudesIA"

    IdSolicitudIA: Mapped[int] = mapped_column(primary_key=True)
    Fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_ahora_utc,
        server_default=func.now(),
        index=True,
    )
    Servicio: Mapped[str] = mapped_column(String(50), nullable=False)
    Modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    Exitosa: Mapped[bool] = mapped_column(Boolean, nullable=False)
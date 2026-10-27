from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

ESTADO_NOTIFICACION_PROCESADA = "procesada"
ESTADO_NOTIFICACION_IGNORADA = "ignorada"
ESTADO_NOTIFICACION_ERROR = "error"


class EstadoNotificacionPasarela(Base):
    __tablename__ = "EstadosNotificacionesPasarela"

    IdEstadoNotificacionPasarela: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    Activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )


class NotificacionPasarela(Base):
    """Recepción de un webhook de la pasarela (US 117).

    Solo guarda el tipo y los identificadores que informa la pasarela: nunca el
    cuerpo crudo, datos de tarjeta ni datos personales del pagador.
    """

    __tablename__ = "NotificacionesPasarela"
    __table_args__ = (
        Index("IX_NotificacionesPasarela_Estado_Fecha", "IdEstadoNotificacionPasarela", "FechaRecepcion"),
        Index("IX_NotificacionesPasarela_Recurso", "Tipo", "IdRecurso"),
    )

    IdNotificacionPasarela: Mapped[int] = mapped_column(primary_key=True)
    IdEstadoNotificacionPasarela: Mapped[int] = mapped_column(
        ForeignKey("EstadosNotificacionesPasarela.IdEstadoNotificacionPasarela"), nullable=False
    )
    Tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    IdRecurso: Mapped[str] = mapped_column(String(150), nullable=False)
    IdSolicitudPasarela: Mapped[str | None] = mapped_column(String(150), nullable=True)
    Error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    FechaRecepcion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

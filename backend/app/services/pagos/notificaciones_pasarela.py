"""Registro de las notificaciones recibidas de la pasarela de pagos (US 117)."""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notificacion_pasarela import EstadoNotificacionPasarela, NotificacionPasarela

logger = logging.getLogger(__name__)

LARGO_ERROR = 500


def describir_error(error: Exception) -> str:
    detalle = str(error).strip()
    texto = f"{type(error).__name__}: {detalle}" if detalle else type(error).__name__
    return texto[:LARGO_ERROR]


def registrar(
    db: Session,
    *,
    tipo: str,
    id_recurso: str,
    id_solicitud: str | None,
    estado: str,
    error: str | None = None,
) -> None:
    """Deja constancia de la recepción. Un fallo al registrar no cambia la respuesta."""
    try:
        id_estado = db.scalar(
            select(EstadoNotificacionPasarela.IdEstadoNotificacionPasarela).where(
                EstadoNotificacionPasarela.Nombre == estado
            )
        )
        if id_estado is None:
            logger.warning("Falta el estado maestro de notificaciones %s", estado)
            return
        db.add(
            NotificacionPasarela(
                IdEstadoNotificacionPasarela=id_estado,
                Tipo=(tipo or "desconocido")[:60],
                IdRecurso=id_recurso[:150],
                IdSolicitudPasarela=id_solicitud[:150] if id_solicitud else None,
                Error=error,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("No se pudo registrar la notificación de la pasarela")

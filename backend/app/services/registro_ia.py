import logging

import app.db.session as session_module
from app.models.solicitud_ia import SolicitudIA

logger = logging.getLogger(__name__)

SERVICIO_SUGERENCIA_ACTIVIDADES = "sugerencia_actividades"
SERVICIO_ANALISIS_HORARIOS = "analisis_horarios"
SERVICIO_ESCANEO_COMPROBANTES = "escaneo_comprobantes"
SERVICIO_RECOMENDACION_ENTRADAS = "recomendacion_entradas"


def registrar_solicitud_ia(servicio: str, modelo: str | None, exitosa: bool) -> None:
    try:
        with session_module.SessionLocal() as db:
            db.add(
                SolicitudIA(
                    Servicio=servicio,
                    Modelo=(modelo or "desconocido")[:100],
                    Exitosa=exitosa,
                )
            )
            db.commit()
    except Exception:
        logger.warning("No se pudo registrar la solicitud de IA (%s)", servicio, exc_info=True)
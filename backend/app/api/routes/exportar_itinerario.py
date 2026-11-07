"""Exportar el itinerario a PDF o a calendario (.ics)."""

import logging
from dataclasses import replace
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.usuario import Usuario
from app.services import exportar_itinerario as servicio
from app.services.itinerario_ics import generar_ics
from app.services.itinerario_pdf import generar_pdf
from app.services.trip_access import get_trip_with_relations, require_trip_access

router = APIRouter()
logger = logging.getLogger(__name__)

TIPOS_ARCHIVO = {
    "pdf": ("application/pdf", "pdf"),
    "ics": ("text/calendar; charset=utf-8", "ics"),
}


def _ahora_en(zona: str | None) -> datetime:
    ahora = datetime.now(timezone.utc)
    if not zona:
        return ahora
    try:
        return ahora.astimezone(ZoneInfo(zona))
    except (ZoneInfoNotFoundError, ValueError):
        return ahora


def _content_disposition(nombre: str) -> str:
    alternativo = nombre.encode("ascii", "ignore").decode("ascii").replace('"', "") or "itinerario"
    return f"attachment; filename=\"{alternativo}\"; filename*=UTF-8''{quote(nombre)}"


@router.get("/{trip_id}/itinerario/exportar")
async def exportar_itinerario(
    trip_id: int,
    formato: Literal["pdf", "ics"] = Query("pdf"),
    dias: list[int] | None = Query(None),
    zonaHoraria: str | None = Query(None, max_length=64),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    servicio.validar_exportacion(viaje, current_user)

    itinerario = servicio.construir_itinerario(viaje, current_user, dias, _ahora_en(zonaHoraria))
    if itinerario.cantidad_eventos == 0:
        raise servicio.error_exportacion(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Los días elegidos no tienen actividades ni traslados para exportar.",
            servicio.ITINERARY_EMPTY,
        )

    try:
        if formato == "pdf":
            portada = await servicio.descargar_portada(viaje)
            contenido = generar_pdf(replace(itinerario, portada=portada))
        else:
            contenido = generar_ics(itinerario)
    except Exception:
        logger.exception("No se pudo generar la exportación del itinerario del viaje %s", trip_id)
        raise servicio.error_exportacion(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "No se pudo generar el archivo. Intentá de nuevo.",
            servicio.EXPORT_FAILED,
        )

    tipo, extension = TIPOS_ARCHIVO[formato]
    return Response(
        content=contenido,
        media_type=tipo,
        headers={
            "Content-Disposition": _content_disposition(servicio.nombre_archivo(viaje.Titulo, extension)),
            "Cache-Control": "no-store",
        },
    )
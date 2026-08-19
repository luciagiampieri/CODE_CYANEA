from __future__ import annotations

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.ruta_diaria import RutaDiaria

logger = logging.getLogger(__name__)

MINIMO_ACTIVIDADES_CON_UBICACION = 2
MAXIMO_ACTIVIDADES_CON_UBICACION = 25
GOOGLE_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"
DIRECTIONS_MODE = "driving" 


class RutaValidationError(Exception):
    """Error de validación de negocio: no hay actividades suficientes con ubicación."""

    def __init__(self, message: str, actividades_excluidas: list[ActividadItinerario] | None = None):
        super().__init__(message)
        self.message = message
        self.actividades_excluidas = actividades_excluidas or []


class RutaProviderError(Exception):
    """Error al consultar el proveedor externo (Google Directions)."""


def _resolver_lugar(actividad: ActividadItinerario):
    if actividad.LugarInteres is not None:
        return actividad.LugarInteres
    if actividad.LugarInteresViaje is not None:
        return actividad.LugarInteresViaje.LugarInteres
    return None


def _actividades_con_y_sin_ubicacion(
    dia: DiaCronograma,
) -> tuple[list[ActividadItinerario], list[ActividadItinerario]]:
    con_ubicacion: list[ActividadItinerario] = []
    sin_ubicacion: list[ActividadItinerario] = []

    for actividad in dia.Actividades:
        if _resolver_lugar(actividad) is not None:
            con_ubicacion.append(actividad)
        else:
            sin_ubicacion.append(actividad)

    return con_ubicacion, sin_ubicacion


async def _consultar_google_directions(actividades: list[ActividadItinerario]) -> dict:
    origen = _resolver_lugar(actividades[0])
    destino = _resolver_lugar(actividades[-1])
    intermedias = actividades[1:-1]

    params = {
        "origin": f"{origen.Lat},{origen.Lng}",
        "destination": f"{destino.Lat},{destino.Lng}",
        "mode": DIRECTIONS_MODE,
        "key": settings.google_maps_api_key,
    }

    if intermedias:
        params["waypoints"] = "|".join(
            f"{_resolver_lugar(a).Lat},{_resolver_lugar(a).Lng}" for a in intermedias
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(GOOGLE_DIRECTIONS_URL, params=params)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Fallo de red al consultar Google Directions: %s", exc)
        raise RutaProviderError(
            "No se pudo contactar al servicio de rutas. Intentá nuevamente en unos minutos."
        ) from exc

    data = response.json()
    estado = data.get("status")

    if estado != "OK":
        mensaje_google = data.get("error_message", estado)
        logger.warning("Google Directions devolvió estado no-OK: %s (%s)", estado, mensaje_google)
        raise RutaProviderError(
            f"No se pudo calcular la ruta entre las actividades seleccionadas. Detalle: {mensaje_google}"
        )

    return data


async def generar_ruta_diaria(
    db: Session, dia: DiaCronograma
) -> tuple[RutaDiaria, list[ActividadItinerario]]:

    con_ubicacion, sin_ubicacion = _actividades_con_y_sin_ubicacion(dia)

    if len(con_ubicacion) < MINIMO_ACTIVIDADES_CON_UBICACION:
        raise RutaValidationError(
            "Se necesitan al menos dos actividades con ubicación cargada para generar una ruta.",
            actividades_excluidas=sin_ubicacion,
        )

    if len(con_ubicacion) > MAXIMO_ACTIVIDADES_CON_UBICACION:
        raise RutaValidationError(
            f"Este día tiene {len(con_ubicacion)} actividades con ubicación, pero el servicio de rutas "
            f"solo admite hasta {MAXIMO_ACTIVIDADES_CON_UBICACION}. Quitá algunas actividades del día o "
            "sacale la ubicación a las que menos importe incluir en la ruta.",
        )

    data = await _consultar_google_directions(con_ubicacion)
    ruta_google = data["routes"][0]

    ruta = db.scalar(
        select(RutaDiaria).where(RutaDiaria.IdDiaCronograma == dia.IdDiaCronograma)
    )
    if ruta is None:
        ruta = RutaDiaria(IdDiaCronograma=dia.IdDiaCronograma)
        db.add(ruta)

    ruta.PolilineaCodificada = ruta_google["overview_polyline"]["points"]
    ruta.DistanciaMetros = sum(leg["distance"]["value"] for leg in ruta_google["legs"])
    ruta.DuracionSegundos = sum(leg["duration"]["value"] for leg in ruta_google["legs"])
    ruta.IdsActividadesOrdenadas = [a.IdActividad for a in con_ubicacion]

    db.commit()
    db.refresh(ruta)

    return ruta, sin_ubicacion


async def sincronizar_ruta_tras_cambio_actividad(db: Session, dia: DiaCronograma) -> dict | None:
    ruta_existente = db.scalar(
        select(RutaDiaria).where(RutaDiaria.IdDiaCronograma == dia.IdDiaCronograma)
    )
    if ruta_existente is None:
        return None

    try:
        ruta, excluidas = await generar_ruta_diaria(db, dia)
        return {"tipo": "ruta_actualizada", "ruta": ruta, "actividadesExcluidas": excluidas}
    except RutaValidationError:
        db.delete(ruta_existente)
        db.commit()
        return {"tipo": "ruta_eliminada"}
    except RutaProviderError as exc:
        logger.warning(
            "No se pudo regenerar la ruta del día %s: %s", dia.IdDiaCronograma, exc
        )
        return None
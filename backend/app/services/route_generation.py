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

MODOS_VALIDOS = {"walking", "driving", "bicycling", "transit"}
MODO_POR_DEFECTO = "walking"

MODO_LABEL = {
    "walking": "caminando",
    "driving": "en auto",
    "bicycling": "en bici",
    "transit": "en transporte público",
}

# Traducción de los estados de Google Directions a mensajes claros para el usuario.
# https://developers.google.com/maps/documentation/directions/get-directions#DirectionsStatus
MENSAJES_ESTADO_GOOGLE = {
    "ZERO_RESULTS": (
        "No encontramos una ruta {modo} entre esas actividades. Puede que estén muy "
        "lejos entre sí para ese medio de transporte, o que no haya una conexión directa. "
        "Probá con otro modo de viaje (por ejemplo, auto)."
    ),
    "OVER_QUERY_LIMIT": (
        "El servicio de rutas está recibiendo demasiadas solicitudes en este momento. "
        "Esperá unos segundos y volvé a intentarlo."
    ),
    "REQUEST_DENIED": (
        "El servicio de rutas rechazó la solicitud. Si el problema persiste, contactá al soporte."
    ),
    "INVALID_REQUEST": (
        "No se pudo armar la solicitud de ruta con las ubicaciones cargadas. Revisá que "
        "las actividades tengan una ubicación válida."
    ),
    "MAX_WAYPOINTS_EXCEEDED": (
        "Hay demasiadas actividades con ubicación en este día para calcular una ruta. "
        "Quitá algunas y volvé a intentarlo."
    ),
    "UNKNOWN_ERROR": (
        "Hubo un problema temporal del lado de Google Maps. Intentá nuevamente en unos minutos."
    ),
}


class RutaValidationError(Exception):
    """Error de validación de negocio: no hay actividades suficientes con ubicación."""

    def __init__(self, message: str, actividades_excluidas: list[ActividadItinerario] | None = None):
        super().__init__(message)
        self.message = message
        self.actividades_excluidas = actividades_excluidas or []


class RutaProviderError(Exception):
    """Error al consultar el proveedor externo (Google Directions)."""


class RutaModoInvalidoError(Exception):
    """El modo de viaje solicitado no es válido."""


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


def _mensaje_amigable_para_estado(estado: str, modo: str, mensaje_google: str | None) -> str:
    plantilla = MENSAJES_ESTADO_GOOGLE.get(estado)
    if plantilla is not None:
        return plantilla.format(modo=MODO_LABEL.get(modo, modo))

    detalle = mensaje_google or estado
    return f"No se pudo calcular la ruta entre las actividades seleccionadas. Detalle: {detalle}"


async def _consultar_google_directions(
    actividades: list[ActividadItinerario], modo: str
) -> dict:
    origen = _resolver_lugar(actividades[0])
    destino = _resolver_lugar(actividades[-1])
    intermedias = actividades[1:-1]

    params = {
        "origin": f"{origen.Lat},{origen.Lng}",
        "destination": f"{destino.Lat},{destino.Lng}",
        "mode": modo,
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
        mensaje_google = data.get("error_message")
        logger.warning("Google Directions devolvió estado no-OK: %s (%s)", estado, mensaje_google or estado)
        raise RutaProviderError(_mensaje_amigable_para_estado(estado, modo, mensaje_google))

    return data


async def generar_ruta_diaria(
    db: Session, dia: DiaCronograma, modo: str | None = None
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

    ruta = db.scalar(
        select(RutaDiaria).where(RutaDiaria.IdDiaCronograma == dia.IdDiaCronograma)
    )

    if modo is not None:
        if modo not in MODOS_VALIDOS:
            raise RutaModoInvalidoError(
                f"Modo de viaje inválido: {modo}. Opciones: {', '.join(sorted(MODOS_VALIDOS))}."
            )
        modo_a_usar = modo
    elif ruta is not None:
        modo_a_usar = ruta.Modo
    else:
        modo_a_usar = MODO_POR_DEFECTO

    data = await _consultar_google_directions(con_ubicacion, modo_a_usar)
    ruta_google = data["routes"][0]

    if ruta is None:
        ruta = RutaDiaria(IdDiaCronograma=dia.IdDiaCronograma)
        db.add(ruta)

    ruta.Modo = modo_a_usar
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
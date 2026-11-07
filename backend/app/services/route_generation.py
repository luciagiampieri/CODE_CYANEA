from __future__ import annotations

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.ruta_diaria import RutaDiaria
from app.services.traslados import separar_actividades_dia

logger = logging.getLogger(__name__)

MINIMO_ACTIVIDADES_CON_UBICACION = 2
MAXIMO_ACTIVIDADES_CON_UBICACION = 25
GOOGLE_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"

MENSAJE_TRASLADO_SIN_AGENDAR = "Agendá el traslado para calcular la ruta de cada destino."
MENSAJE_SIN_ACTIVIDADES = (
    "Se necesitan al menos dos actividades con ubicación cargada para generar una ruta."
)
MENSAJE_SIN_ACTIVIDADES_POR_DESTINO = (
    "Se necesitan al menos dos actividades con ubicación en alguno de los destinos del día."
)
MENSAJE_DESTINO_AJENO = "Ese destino no forma parte de este día."

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
    actividades: list[ActividadItinerario],
) -> tuple[list[ActividadItinerario], list[ActividadItinerario]]:
    con_ubicacion: list[ActividadItinerario] = []
    sin_ubicacion: list[ActividadItinerario] = []

    for actividad in actividades:
        # Un traslado no es una parada del recorrido del día.
        if actividad.IdTramoTraslado is not None:
            continue
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
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
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


def _grupos_del_dia(dia: DiaCronograma) -> list[tuple[int | None, list[ActividadItinerario]]]:
    """Grupos de actividades que forman cada ruta: (destino, actividades). Un día de traslado
    sin noches en viaje no une los dos destinos."""
    separacion = separar_actividades_dia(dia.Viaje, dia)
    if separacion is None:
        return [(None, dia.Actividades)]
    if not separacion.agendado:
        raise RutaValidationError(MENSAJE_TRASLADO_SIN_AGENDAR)
    id_salida, id_llegada = separacion.tramo.clave[1], separacion.tramo.clave[2]
    return [(id_salida, separacion.antes), (id_llegada, separacion.despues)]


async def generar_rutas_dia(
    db: Session, dia: DiaCronograma, modo: str | None = None, id_destino: int | None = None
) -> tuple[list[RutaDiaria], list[ActividadItinerario]]:
    """Con `id_destino` recalcula solo la ruta de ese destino y no toca la del otro."""
    grupos = _grupos_del_dia(dia)
    por_destino = len(grupos) > 1
    if id_destino is not None:
        grupos = [grupo for grupo in grupos if grupo[0] == id_destino]
        if not grupos:
            raise RutaValidationError(MENSAJE_DESTINO_AJENO)

    excluidas: list[ActividadItinerario] = []
    a_calcular: list[tuple[int | None, list[ActividadItinerario]]] = []
    for clave, actividades in grupos:
        con_ubicacion, sin_ubicacion = _actividades_con_y_sin_ubicacion(actividades)
        excluidas.extend(sin_ubicacion)
        if len(con_ubicacion) >= MINIMO_ACTIVIDADES_CON_UBICACION:
            a_calcular.append((clave, con_ubicacion))

    if not a_calcular:
        raise RutaValidationError(
            MENSAJE_SIN_ACTIVIDADES_POR_DESTINO if por_destino else MENSAJE_SIN_ACTIVIDADES,
            actividades_excluidas=excluidas,
        )

    for _, con_ubicacion in a_calcular:
        if len(con_ubicacion) > MAXIMO_ACTIVIDADES_CON_UBICACION:
            raise RutaValidationError(
                f"Este día tiene {len(con_ubicacion)} actividades con ubicación, pero el servicio de rutas "
                f"solo admite hasta {MAXIMO_ACTIVIDADES_CON_UBICACION}. Quitá algunas actividades del día o "
                "sacale la ubicación a las que menos importe incluir en la ruta.",
            )

    existentes = list(
        db.scalars(
            select(RutaDiaria)
            .where(RutaDiaria.IdDiaCronograma == dia.IdDiaCronograma)
            .order_by(RutaDiaria.IdRutaDiaria)
        ).all()
    )

    if modo is not None:
        if modo not in MODOS_VALIDOS:
            raise RutaModoInvalidoError(
                f"Modo de viaje inválido: {modo}. Opciones: {', '.join(sorted(MODOS_VALIDOS))}."
            )
        modo_nuevas = modo
    elif existentes:
        modo_nuevas = existentes[0].Modo
    else:
        modo_nuevas = MODO_POR_DEFECTO

    por_clave = {ruta.IdDestino: ruta for ruta in existentes}

    def modo_de(clave: int | None) -> str:
        # Cada destino conserva su modo, salvo que se pida uno.
        if modo is None and clave in por_clave:
            return por_clave[clave].Modo
        return modo_nuevas

    # Primero todas las consultas: si una falla, las rutas guardadas quedan como estaban.
    resultados = [
        (clave, con_ubicacion, await _consultar_google_directions(con_ubicacion, modo_de(clave)))
        for clave, con_ubicacion in a_calcular
    ]

    rutas: list[RutaDiaria] = []
    for clave, con_ubicacion, data in resultados:
        ruta_google = data["routes"][0]
        modo_ruta = modo_de(clave)
        ruta = por_clave.pop(clave, None)
        if ruta is None:
            ruta = RutaDiaria(IdDiaCronograma=dia.IdDiaCronograma, IdDestino=clave)
            db.add(ruta)

        ruta.Modo = modo_ruta
        ruta.PolilineaCodificada = ruta_google["overview_polyline"]["points"]
        ruta.DistanciaMetros = sum(leg["distance"]["value"] for leg in ruta_google["legs"])
        ruta.DuracionSegundos = sum(leg["duration"]["value"] for leg in ruta_google["legs"])
        ruta.IdsActividadesOrdenadas = [a.IdActividad for a in con_ubicacion]
        rutas.append(ruta)

    # Rutas que ya no corresponden: el destino quedó sin actividades o el día cambió de forma.
    if id_destino is None:
        for sobrante in por_clave.values():
            db.delete(sobrante)

    db.commit()
    for ruta in rutas:
        db.refresh(ruta)

    return rutas, excluidas


async def generar_ruta_diaria(
    db: Session, dia: DiaCronograma, modo: str | None = None
) -> tuple[RutaDiaria, list[ActividadItinerario]]:
    """Primera ruta del día, para quien solo necesita una (asistente)."""
    rutas, excluidas = await generar_rutas_dia(db, dia, modo)
    return rutas[0], excluidas


async def sincronizar_ruta_tras_cambio_actividad(db: Session, dia: DiaCronograma) -> dict | None:
    existentes = db.scalars(
        select(RutaDiaria).where(RutaDiaria.IdDiaCronograma == dia.IdDiaCronograma)
    ).all()
    if not existentes:
        return None

    try:
        rutas, excluidas = await generar_rutas_dia(db, dia)
        return {
            "tipo": "ruta_actualizada",
            "ruta": rutas[0],
            "rutas": rutas,
            "actividadesExcluidas": excluidas,
        }
    except RutaValidationError:
        for ruta in existentes:
            db.delete(ruta)
        db.commit()
        return {"tipo": "ruta_eliminada"}
    except RutaProviderError as exc:
        logger.warning(
            "No se pudo regenerar la ruta del día %s: %s", dia.IdDiaCronograma, exc
        )
        return None


def _forma_vigente(ruta: RutaDiaria, separacion) -> bool:
    if separacion is None:
        return ruta.IdDestino is None
    return separacion.agendado and ruta.IdDestino in separacion.tramo.clave[1:]


def descartar_rutas_desactualizadas(viaje) -> None:
    """Quita las rutas cuya forma ya no corresponde al día después de cambiar el recorrido, sin
    consultar a Google: el día deja de tener ruta hasta que se vuelva a generar."""
    for dia in viaje.Cronograma:
        if not dia.Rutas:
            continue
        separacion = separar_actividades_dia(viaje, dia)
        for ruta in list(dia.Rutas):
            if not _forma_vigente(ruta, separacion):
                dia.Rutas.remove(ruta)

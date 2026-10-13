"""Validaciones y reglas de negocio de las sugerencias de actividades (US 87).

Independientes del proveedor de IA: toda respuesta pasa por acá antes de llegar al
usuario (RNF-32). Una sugerencia que no cumple una regla se descarta sola, sin mostrarse.
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
import unicodedata
from dataclasses import dataclass, replace
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Awaitable, Callable

from pydantic import ValidationError

from app.services.activity_ai.base import (
    AI_INVALID_RESPONSE,
    MENSAJE_RESPUESTA_INVALIDA,
    RespuestaSugerenciasIA,
    SugerenciaIA,
    SuggestionError,
)
from app.services.activity_ai.context import (
    MIN_DURACION_MINUTOS,
    parsear_hhmm,
    superpone,
)

logger = logging.getLogger(__name__)

MONTO_MAXIMO = Decimal("9999999999.99")
UMBRAL_SIMILITUD_NOMBRE = 0.5
_PALABRAS_VACIAS = {"de", "del", "la", "el", "los", "las", "y", "e", "en", "a", "the", "of"}


@dataclass
class ActividadDia:
    nombre: str
    inicio: int  
    fin: int
    place_id: str | None = None
    lat: float | None = None
    lng: float | None = None


@dataclass
class ReglasValidacion:
    franja_inicio: int
    franja_fin: int
    actividades: list[ActividadDia]
    place_ids_excluidos: set[str]
    presupuesto_maximo: Decimal | None
    puntos_referencia: list[tuple[float, float]]
    max_km: float
    max_resultados: int
    destino_nombre: str
    centro_busqueda: tuple[float, float] | None


@dataclass
class LugarEncontrado:
    place_id: str 
    nombre: str
    direccion: str
    lat: float
    lng: float
    categoria: str | None = None
    sitio_web: str | None = None  
    foto_ref: str | None = None  


@dataclass
class SugerenciaValida:
    nombre: str
    descripcion: str
    inicio: int
    fin: int
    costo: Decimal
    motivo: str
    lugar_pedido: str
    place_id: str = ""
    lugar_nombre: str = ""
    direccion: str = ""
    lat: float = 0.0
    lng: float = 0.0
    sitio_web: str | None = None
    foto_ref: str | None = None


Buscador = Callable[[str, "tuple[float, float] | None", float], Awaitable[list[LugarEncontrado]]]


def validar_esquema(crudo: dict) -> RespuestaSugerenciasIA:
    try:
        return RespuestaSugerenciasIA.model_validate(crudo)
    except ValidationError:
        raise SuggestionError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)


def normalizar_id(place_id: str | None) -> str:
    return (place_id or "").replace("google:", "", 1).strip()


def distancia_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radio = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radio * math.asin(math.sqrt(a))


def _tokens(texto: str) -> set[str]:
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFKD", texto.lower()) if not unicodedata.combining(c)
    )
    return {t for t in re.findall(r"[a-z0-9]+", sin_acentos) if t not in _PALABRAS_VACIAS}


def similitud_nombres(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def _validar_item(item: SugerenciaIA, reglas: ReglasValidacion) -> SugerenciaValida | None:
    nombre = " ".join(item.nombre.split())[:150]
    lugar = " ".join(item.lugar_nombre.split())
    motivo = item.motivo.strip()
    if not nombre or not lugar or not motivo:
        return None

    inicio, fin = parsear_hhmm(item.hora_inicio), parsear_hhmm(item.hora_fin)
    if inicio is None or fin is None or fin <= inicio:
        return None
    if fin - inicio < MIN_DURACION_MINUTOS:
        return None
    if inicio < reglas.franja_inicio or fin > reglas.franja_fin:
        return None
    if any(superpone(inicio, fin, a.inicio, a.fin) for a in reglas.actividades):
        return None

    try:
        costo = item.costo_estimado_ars.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, AttributeError):
        return None
    if costo < 0 or costo > MONTO_MAXIMO:
        return None
    if reglas.presupuesto_maximo is not None and costo > reglas.presupuesto_maximo:
        return None

    return SugerenciaValida(
        nombre=nombre,
        descripcion=" ".join(item.descripcion.split()),
        inicio=inicio,
        fin=fin,
        costo=costo,
        motivo=motivo,
        lugar_pedido=lugar,
    )


def _cumple_distancia(lat: float, lng: float, reglas: ReglasValidacion) -> bool:
    return all(
        distancia_km(lat, lng, p_lat, p_lng) <= reglas.max_km
        for p_lat, p_lng in reglas.puntos_referencia
    )


def _elegir_lugar(
    candidata: SugerenciaValida, lugares: list[LugarEncontrado], reglas: ReglasValidacion
) -> SugerenciaValida | None:
    """Devuelve la sugerencia completada con el lugar de Google que mejor coincide."""
    mejores = sorted(
        (
            (similitud_nombres(candidata.lugar_pedido, lugar.nombre), lugar)
            for lugar in lugares
        ),
        key=lambda par: par[0],
        reverse=True,
    )
    for similitud, lugar in mejores:
        if similitud < UMBRAL_SIMILITUD_NOMBRE:
            break
        if not lugar.direccion or not _cumple_distancia(lugar.lat, lugar.lng, reglas):
            continue
        return replace(
            candidata,
            place_id=lugar.place_id,
            lugar_nombre=lugar.nombre[:200],
            direccion=lugar.direccion[:255],
            lat=lugar.lat,
            lng=lugar.lng,
            sitio_web=lugar.sitio_web,
            foto_ref=lugar.foto_ref,
        )
    return None


async def buscar_lugares_google(
    consulta: str, centro: tuple[float, float] | None, radio_metros: float
) -> list[LugarEncontrado]:
    """Busca el lugar sugerido en Google Places."""
    from app.services.place_search import _google_places_text_search, _parse_google_places_results

    payload: dict = {"textQuery": consulta, "languageCode": "es", "maxResultCount": 3}
    if centro is not None:
        payload["locationBias"] = {
            "circle": {
                "center": {"latitude": centro[0], "longitude": centro[1]},
                "radius": min(max(radio_metros, 1000.0), 50000.0),
            }
        }
    data = await _google_places_text_search(
        payload,
        field_mask=(
            "places.id,places.displayName,places.formattedAddress,places.location,"
            "places.types,places.primaryType,places.primaryTypeDisplayName,"
            "places.websiteUri,places.photos"
        ),
    )
    crudos = {normalizar_id(p.get("id")): p for p in (data.get("places") or []) if p.get("id")}
    encontrados: list[LugarEncontrado] = []
    for item in _parse_google_places_results(data):
        sin_direccion = not item.address or item.address.strip().lower() == item.name.strip().lower()
        if item.lat is None or item.lng is None or sin_direccion:
            continue
        crudo = crudos.get(normalizar_id(item.place_id), {})
        sitio_web = crudo.get("websiteUri")
        if not isinstance(sitio_web, str) or not sitio_web.lower().startswith(("http://", "https://")):
            sitio_web = None
        fotos = crudo.get("photos") or []
        foto_ref = fotos[0].get("name") if fotos and isinstance(fotos[0], dict) else None
        encontrados.append(
            LugarEncontrado(
                item.place_id,
                item.name,
                item.address,
                item.lat,
                item.lng,
                item.category,
                sitio_web=sitio_web[:500] if sitio_web else None,
                foto_ref=foto_ref[:500] if isinstance(foto_ref, str) else None,
            )
        )
    return encontrados


async def filtrar_sugerencias(
    respuesta: RespuestaSugerenciasIA,
    reglas: ReglasValidacion,
    buscador: Buscador,
    segundos_disponibles: float,
) -> list[SugerenciaValida]:
    candidatas = [
        valida
        for valida in (_validar_item(item, reglas) for item in respuesta.sugerencias)
        if valida is not None
    ]
    if not candidatas:
        return []

    semaforo = asyncio.Semaphore(5)

    async def resolver(candidata: SugerenciaValida) -> SugerenciaValida | None:
        async with semaforo:
            try:
                lugares = await asyncio.wait_for(
                    buscador(
                        f"{candidata.lugar_pedido}, {reglas.destino_nombre}",
                        reglas.centro_busqueda,
                        reglas.max_km * 1000,
                    ),
                    timeout=segundos_disponibles,
                )
            except Exception as error:  
                logger.warning("No se pudo validar el lugar '%s': %s", candidata.lugar_pedido, error)
                return None
        return _elegir_lugar(candidata, lugares, reglas)

    resueltas = await asyncio.gather(*(resolver(c) for c in candidatas))

    # Reglas que dependen del conjunto: lugares repetidos y superposición entre sugerencias.
    elegidas: list[SugerenciaValida] = []
    ids_usados = set(reglas.place_ids_excluidos)
    for sugerencia in resueltas:
        if sugerencia is None:
            continue
        id_lugar = normalizar_id(sugerencia.place_id)
        if id_lugar in ids_usados:
            continue
        if any(superpone(sugerencia.inicio, sugerencia.fin, e.inicio, e.fin) for e in elegidas):
            continue
        ids_usados.add(id_lugar)
        elegidas.append(sugerencia)
        if len(elegidas) >= reglas.max_resultados:
            break
    return elegidas
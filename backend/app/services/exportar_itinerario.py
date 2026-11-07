"""Exportación del itinerario a PDF y a calendario (.ics).

Arma una foto del itinerario con lo que se exporta: las actividades y los traslados
agendados de los días elegidos. Las sugerencias pendientes o en votación viven aparte
y no son actividades del itinerario, así que nunca entran. Tampoco se incluye nada de
los participantes ni del repositorio.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from typing import Iterator, Sequence
from urllib.parse import urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import HTTPException, status

from app.models.tramo_traslado_viaje import (
    TIPO_TRAMO_ENTRE_DESTINOS,
    TIPO_TRAMO_IDA,
    TIPO_TRAMO_REGRESO,
)
from app.services import traslados as servicio_traslados
from app.services.recorrido_viaje import calcular_tramos, recorrido_armado

logger = logging.getLogger(__name__)

EXPORT_FORBIDDEN = "EXPORT_FORBIDDEN"
TRIP_CANCELLED = "TRIP_CANCELLED"
DAY_NOT_FOUND = "DAY_NOT_FOUND"
ITINERARY_EMPTY = "ITINERARY_EMPTY"
EXPORT_FAILED = "EXPORT_FAILED"

ESTADOS_QUE_EXPORTAN = {"aceptado", "salio"}

TAMANO_MAXIMO_PORTADA = 8 * 1024 * 1024

DIAS_SEMANA = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


@dataclass(frozen=True)
class Momento:
    fecha: date
    hora: time
    zona: str | None


@dataclass(frozen=True)
class EventoItinerario:
    uid: str
    titulo: str
    inicio: Momento
    fin: Momento
    horario: str
    descripcion: str | None = None
    direccion: str | None = None
    ubicacion: str | None = None
    url_mapa: str | None = None
    linea_traslado: str | None = None


@dataclass(frozen=True)
class DiaItinerario:
    id_dia: int
    fecha: date
    indice: int
    destino: str | None
    eventos: list[EventoItinerario] = field(default_factory=list)


@dataclass(frozen=True)
class ItinerarioExportado:
    titulo: str
    destinos: str
    fecha_inicio: date
    fecha_fin: date
    dias: list[DiaItinerario]
    generado_en: datetime
    portada: bytes | None = None

    @property
    def cantidad_eventos(self) -> int:
        return sum(len(dia.eventos) for dia in self.dias)


@dataclass(frozen=True)
class LugarDelDia:
    etiqueta: str | None
    destino: object | None
    origen: object | None


def error_exportacion(codigo_http: int, mensaje: str, codigo: str) -> HTTPException:
    return HTTPException(status_code=codigo_http, detail=mensaje, headers={"X-Error-Code": codigo})


def _participacion(viaje, usuario):
    return next((p for p in viaje.Participantes if p.IdUsuario == usuario.IdUsuario), None)


def validar_exportacion(viaje, usuario) -> None:
    participacion = _participacion(viaje, usuario)
    estado = participacion.EstadoParticipacion.Nombre if participacion is not None else None
    if estado not in ESTADOS_QUE_EXPORTAN:
        raise error_exportacion(
            status.HTTP_403_FORBIDDEN,
            "Solo los participantes del viaje pueden exportar el itinerario.",
            EXPORT_FORBIDDEN,
        )
    if viaje.EstadoViaje is not None and viaje.EstadoViaje.Nombre == "cancelado":
        raise error_exportacion(
            status.HTTP_409_CONFLICT,
            "No se puede exportar el itinerario de un viaje cancelado.",
            TRIP_CANCELLED,
        )


@lru_cache(maxsize=1)
def _buscador_zonas():
    try:
        from timezonefinder import TimezoneFinder
    except ImportError:
        logger.warning("timezonefinder no está instalado: el calendario se exporta sin zona horaria.")
        return None
    return TimezoneFinder()


@lru_cache(maxsize=512)
def zona_horaria(lat: float | None, lng: float | None) -> str | None:
    if lat is None or lng is None:
        return None
    buscador = _buscador_zonas()
    if buscador is None:
        return None
    try:
        zona = buscador.timezone_at(lat=lat, lng=lng)
    except ValueError:
        return None
    if zona is None:
        return None
    try:
        ZoneInfo(zona)
    except (ZoneInfoNotFoundError, ValueError):
        return None
    return zona


def zona_de(destino) -> str | None:
    if destino is None:
        return None
    return zona_horaria(destino.Lat, destino.Lng)


def _rango(desde: date, hasta: date) -> Iterator[date]:
    fecha = desde
    while fecha <= hasta:
        yield fecha
        fecha += timedelta(days=1)


def lugares_por_fecha(destinos: Sequence, fecha_inicio: date, fecha_fin: date) -> dict[date, LugarDelDia]:
    """Destino de cada día según el recorrido (US 135). Sin recorrido armado no hay
    etiqueta, y la zona horaria sale del primer destino."""
    ordenados = sorted(destinos, key=lambda d: (d.Orden, d.IdDestino))
    if not ordenados:
        return {}

    if not recorrido_armado(ordenados):
        unico = ordenados[0].Destino
        return {fecha: LugarDelDia(None, unico, unico) for fecha in _rango(fecha_inicio, fecha_fin)}

    lugares: dict[date, LugarDelDia] = {}
    tramos = calcular_tramos(ordenados, fecha_inicio)
    ultimo = len(ordenados) - 1
    for indice, (rel, tramo) in enumerate(zip(ordenados, tramos)):
        destino = rel.Destino
        hasta = fecha_fin if indice == ultimo else tramo.salida - timedelta(days=1)
        for fecha in _rango(tramo.llegada, hasta):
            lugares.setdefault(fecha, LugarDelDia(destino.Nombre, destino, destino))
        if indice == ultimo:
            continue

        siguiente = ordenados[indice + 1].Destino
        lugares[tramo.salida] = LugarDelDia(
            f"De {destino.Nombre} a {siguiente.Nombre}", siguiente, destino
        )
        en_viaje = _rango(tramo.salida + timedelta(days=1), tramo.llegada_siguiente - timedelta(days=1))
        for fecha in en_viaje:
            lugares[fecha] = LugarDelDia(f"En viaje a {siguiente.Nombre}", siguiente, destino)
    return lugares


def _hora(valor: time) -> str:
    return valor.strftime("%H:%M")


def _lugar_de(actividad):
    if actividad.LugarInteres is not None:
        return actividad.LugarInteres
    if actividad.LugarInteresViaje is not None:
        return actividad.LugarInteresViaje.LugarInteres
    return None


def url_google_maps(lugar) -> str | None:
    if lugar is None:
        return None
    if lugar.Lat is not None and lugar.Lng is not None:
        parametros = {"api": "1", "query": f"{lugar.Lat},{lugar.Lng}"}
    elif lugar.Direccion or lugar.Nombre:
        parametros = {"api": "1", "query": lugar.Direccion or lugar.Nombre}
    else:
        return None
    if lugar.GooglePlaceId:
        parametros["query_place_id"] = lugar.GooglePlaceId
    return "https://www.google.com/maps/search/?" + urlencode(parametros)


def _uid(actividad) -> str:
    return f"actividad-{actividad.IdActividad}@cyanea.app"


def _evento_actividad(actividad, fecha: date, zona: str | None) -> EventoItinerario:
    lugar = _lugar_de(actividad)
    direccion = lugar.Direccion if lugar is not None else None
    nombre_lugar = lugar.Nombre if lugar is not None else None
    partes_ubicacion = [
        nombre_lugar if nombre_lugar and nombre_lugar != actividad.Nombre else None,
        direccion,
    ]
    ubicacion = ", ".join(parte for parte in partes_ubicacion if parte) or nombre_lugar
    return EventoItinerario(
        uid=_uid(actividad),
        titulo=actividad.Nombre,
        inicio=Momento(fecha, actividad.HoraInicio, zona),
        fin=Momento(fecha, actividad.HoraFin, zona),
        horario=f"{_hora(actividad.HoraInicio)} - {_hora(actividad.HoraFin)}",
        descripcion=actividad.Descripcion,
        direccion=direccion,
        ubicacion=ubicacion,
        url_mapa=url_google_maps(lugar),
    )


def _evento_traslado(actividad, estado, destinos: Sequence) -> EventoItinerario:
    medio = servicio_traslados.NOMBRES_MEDIOS.get(actividad.Icono, "Traslado")

    if estado.tipo == TIPO_TRAMO_IDA:
        momento = Momento(estado.fecha_llegada, actividad.HoraFin, zona_de(destinos[0].Destino))
        inicio = fin = momento
        horario = _hora(actividad.HoraFin)
        linea = f"{medio} · Llegada {horario}"
        ubicacion = estado.nombre_llegada
    elif estado.tipo == TIPO_TRAMO_REGRESO:
        momento = Momento(estado.fecha_salida, actividad.HoraInicio, zona_de(destinos[-1].Destino))
        inicio = fin = momento
        horario = _hora(actividad.HoraInicio)
        linea = f"{medio} · Salida {horario}"
        ubicacion = estado.nombre_origen
    else:
        fila = estado.fila
        inicio = Momento(estado.fecha_salida, actividad.HoraInicio, zona_de(fila.DestinoOrigen))
        fin = Momento(estado.fecha_llegada, actividad.HoraFin, zona_de(fila.DestinoLlegada))
        horario = _hora(actividad.HoraInicio)
        llegada = f"Llegada {_hora(actividad.HoraFin)}"
        if not estado.mismo_dia and estado.fecha_llegada is not None:
            llegada += f" del {estado.fecha_llegada:%d/%m}"
        linea = f"{medio} · Salida {horario} · {llegada}"
        ubicacion = f"{estado.nombre_origen} - {estado.nombre_llegada}"

    return EventoItinerario(
        uid=_uid(actividad),
        titulo=actividad.Nombre,
        inicio=inicio,
        fin=fin,
        horario=horario,
        descripcion=actividad.Descripcion,
        ubicacion=ubicacion,
        linea_traslado=linea,
    )


def _zona_actividad(actividad, lugar: LugarDelDia | None, hora_salida: time | None) -> str | None:
    """En un día de cambio, lo que empieza antes de salir sigue en el destino de origen."""
    if lugar is None:
        return None
    if (
        lugar.origen is not lugar.destino
        and hora_salida is not None
        and actividad.HoraInicio < hora_salida
    ):
        return zona_de(lugar.origen)
    return zona_de(lugar.destino)


def _utc(valor: datetime) -> datetime:
    return valor.replace(tzinfo=timezone.utc) if valor.tzinfo is None else valor


def _fecha_salida_usuario(viaje, usuario) -> datetime | None:
    participacion = _participacion(viaje, usuario)
    if participacion is not None and participacion.EstadoParticipacion.Nombre == "salio":
        return participacion.FechaSalida
    return None


def _visible(actividad, fecha_salida: datetime | None) -> bool:
    """Quien abandonó ve lo creado hasta su salida, igual que en el detalle del viaje."""
    if fecha_salida is None or actividad.FechaCreacion is None:
        return True
    try:
        return actividad.FechaCreacion <= fecha_salida
    except TypeError:
        return _utc(actividad.FechaCreacion) <= _utc(fecha_salida)


def etiqueta_destinos(viaje) -> str:
    ordenados = sorted(viaje.Destinos, key=lambda d: (d.Orden, d.IdDestino))
    return " · ".join(
        f"{rel.Destino.Nombre}, {rel.Destino.Pais}" if rel.Destino.Pais else rel.Destino.Nombre
        for rel in ordenados
    )


def construir_itinerario(
    viaje,
    usuario,
    ids_dias: Sequence[int] | None,
    generado_en: datetime,
) -> ItinerarioExportado:
    dias = list(viaje.Cronograma or [])
    if ids_dias:
        pedidos = set(ids_dias)
        if not pedidos <= {dia.IdDiaCronograma for dia in dias}:
            raise error_exportacion(
                status.HTTP_404_NOT_FOUND,
                "Alguno de los días elegidos no existe en este viaje.",
                DAY_NOT_FOUND,
            )
        dias = [dia for dia in dias if dia.IdDiaCronograma in pedidos]

    destinos = sorted(viaje.Destinos, key=lambda d: (d.Orden, d.IdDestino))
    lugares = lugares_por_fecha(destinos, viaje.FechaInicio, viaje.FechaFin)
    estados = {
        estado.actividad.IdActividad: estado
        for estado in servicio_traslados.estados_tramos(viaje)
        if estado.actividad is not None
    }
    salidas = {
        estado.fecha_salida: estado.actividad.HoraInicio
        for estado in estados.values()
        if estado.tipo == TIPO_TRAMO_ENTRE_DESTINOS and estado.validez == servicio_traslados.VALIDO
    }
    fecha_salida = _fecha_salida_usuario(viaje, usuario)

    resultado: list[DiaItinerario] = []
    for dia in sorted(dias, key=lambda d: d.Fecha):
        lugar = lugares.get(dia.Fecha)
        eventos: list[EventoItinerario] = []
        actividades = sorted(dia.Actividades or [], key=lambda a: (a.HoraInicio, a.IdActividad))
        for actividad in actividades:
            if not _visible(actividad, fecha_salida):
                continue
            if actividad.IdTramoTraslado is not None:
                estado = estados.get(actividad.IdActividad)
                if estado is None or estado.validez != servicio_traslados.VALIDO:
                    continue
                eventos.append(_evento_traslado(actividad, estado, destinos))
                continue
            zona = _zona_actividad(actividad, lugar, salidas.get(dia.Fecha))
            eventos.append(_evento_actividad(actividad, dia.Fecha, zona))
        resultado.append(
            DiaItinerario(
                id_dia=dia.IdDiaCronograma,
                fecha=dia.Fecha,
                indice=dia.IndiceDia,
                destino=lugar.etiqueta if lugar is not None else None,
                eventos=eventos,
            )
        )

    return ItinerarioExportado(
        titulo=viaje.Titulo,
        destinos=etiqueta_destinos(viaje),
        fecha_inicio=viaje.FechaInicio,
        fecha_fin=viaje.FechaFin,
        dias=resultado,
        generado_en=generado_en,
    )


async def descargar_portada(viaje) -> bytes | None:
    """Imagen de portada para el PDF. Si no se puede bajar, el PDF sale sin imagen."""
    from app.services.cover_ai import detect_image_mime
    from app.services.place_search import get_place_photo_uri
    from app.services.supabase.storage import obtener_url_publica

    try:
        if viaje.UrlPortadaPersonalizada:
            url = obtener_url_publica(viaje.UrlPortadaPersonalizada)
        elif viaje.GooglePlaceIdPortada:
            url = await get_place_photo_uri(viaje.GooglePlaceIdPortada)
        else:
            return None
        if not url:
            return None
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as cliente:
            respuesta = await cliente.get(url)
            respuesta.raise_for_status()
    except Exception:
        logger.warning(
            "No se pudo descargar la portada del viaje %s para el PDF", viaje.IdViaje, exc_info=True
        )
        return None

    contenido = respuesta.content
    if len(contenido) > TAMANO_MAXIMO_PORTADA or detect_image_mime(contenido) is None:
        return None
    return contenido


def fecha_larga(fecha: date) -> str:
    return f"{DIAS_SEMANA[fecha.weekday()].capitalize()} {fecha.day} de {MESES[fecha.month - 1]}"


def rango_fechas(inicio: date, fin: date) -> str:
    mes_inicio, mes_fin = MESES[inicio.month - 1], MESES[fin.month - 1]
    if inicio == fin:
        return f"{inicio.day} de {mes_inicio} de {inicio.year}"
    if inicio.year != fin.year:
        return f"{inicio.day} de {mes_inicio} de {inicio.year} al {fin.day} de {mes_fin} de {fin.year}"
    if inicio.month != fin.month:
        return f"{inicio.day} de {mes_inicio} al {fin.day} de {mes_fin} de {fin.year}"
    return f"{inicio.day} al {fin.day} de {mes_fin} de {fin.year}"


def nombre_archivo(titulo: str, extension: str) -> str:
    limpio = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", titulo or "")
    limpio = re.sub(r"\s+", " ", limpio).strip() or "Viaje"
    return f"Itinerario - {limpio}.{extension}"
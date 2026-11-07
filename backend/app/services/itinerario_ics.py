"""Archivo de calendario (.ics, RFC 5545) del itinerario exportado.

Los horarios se escriben en UTC a partir de la zona horaria de cada destino: así
Google Calendar, Apple Calendar y Outlook los muestran en la hora correcta aunque el
calendario esté en otra zona, sin depender de que entiendan la zona del destino.
Si un destino no tiene coordenadas, la hora queda "flotante" (sin zona).
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services.exportar_itinerario import EventoItinerario, ItinerarioExportado, Momento

PRODID = "-//Cyanea//Itinerario//ES"
LARGO_MAXIMO = 75


def instante(momento: Momento) -> datetime:
    local = datetime.combine(momento.fecha, momento.hora)
    if momento.zona is None:
        return local
    return local.replace(tzinfo=ZoneInfo(momento.zona)).astimezone(timezone.utc)


def formato_momento(momento: Momento) -> str:
    valor = instante(momento)
    if valor.tzinfo is None:
        return valor.strftime("%Y%m%dT%H%M%S")
    return valor.strftime("%Y%m%dT%H%M%SZ")


def _fin_del_evento(evento: EventoItinerario) -> Momento:
    """Un fin anterior al inicio no es válido en un calendario: queda sin duración."""
    inicio, fin = instante(evento.inicio), instante(evento.fin)
    comparables = (inicio.tzinfo is None) == (fin.tzinfo is None)
    return evento.inicio if comparables and fin < inicio else evento.fin


def escapar(texto: str) -> str:
    return (
        texto.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\r", "\\n")
        .replace("\n", "\\n")
    )


def plegar(linea: str) -> str:
    """Corta en líneas de hasta 75 octetos; cada continuación empieza con un espacio."""
    partes: list[str] = []
    actual = ""
    largo = 0
    for caracter in linea:
        tamano = len(caracter.encode("utf-8"))
        if largo + tamano > LARGO_MAXIMO:
            partes.append(actual)
            actual, largo = " ", 1
        actual += caracter
        largo += tamano
    partes.append(actual)
    return "\r\n".join(partes)


def _descripcion(evento: EventoItinerario) -> str | None:
    partes = [evento.linea_traslado, evento.descripcion]
    if evento.url_mapa:
        partes.append(f"Cómo llegar: {evento.url_mapa}")
    texto = "\n\n".join(parte.strip() for parte in partes if parte and parte.strip())
    return texto or None


def _vevento(evento: EventoItinerario, sello: str) -> list[str]:
    lineas = [
        "BEGIN:VEVENT",
        f"UID:{evento.uid}",
        f"DTSTAMP:{sello}",
        f"DTSTART:{formato_momento(evento.inicio)}",
        f"DTEND:{formato_momento(_fin_del_evento(evento))}",
        f"SUMMARY:{escapar(evento.titulo)}",
    ]
    descripcion = _descripcion(evento)
    if descripcion:
        lineas.append(f"DESCRIPTION:{escapar(descripcion)}")
    if evento.ubicacion:
        lineas.append(f"LOCATION:{escapar(evento.ubicacion)}")
    if evento.url_mapa:
        lineas.append(f"URL:{evento.url_mapa}")
    lineas.append("END:VEVENT")
    return lineas


def generar_ics(itinerario: ItinerarioExportado) -> bytes:
    sello = itinerario.generado_en.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lineas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escapar('Itinerario - ' + itinerario.titulo)}",
    ]
    for dia in itinerario.dias:
        for evento in dia.eventos:
            lineas.extend(_vevento(evento, sello))
    lineas.append("END:VCALENDAR")
    return ("\r\n".join(plegar(linea) for linea in lineas) + "\r\n").encode("utf-8")
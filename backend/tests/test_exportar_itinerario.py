from dataclasses import replace
from datetime import date, datetime, time, timezone
from types import SimpleNamespace

import pytest

from app.services.exportar_itinerario import (
    DiaItinerario,
    EventoItinerario,
    ItinerarioExportado,
    Momento,
    fecha_larga,
    lugares_por_fecha,
    nombre_archivo,
    rango_fechas,
    zona_horaria,
)
from app.services.itinerario_ics import formato_momento, generar_ics
from app.services.itinerario_pdf import generar_pdf

MADRID = "Europe/Madrid"
LISBOA = "Europe/Lisbon"
DIA = date(2026, 11, 10)


def _destino(orden, nombre, noches, en_viaje=0):
    return SimpleNamespace(
        Orden=orden,
        IdDestino=orden + 1,
        Noches=noches,
        NochesEnViaje=en_viaje,
        Destino=SimpleNamespace(Nombre=nombre, Lat=None, Lng=None),
    )


def _actividad(**cambios):
    base = EventoItinerario(
        uid="actividad-7@cyanea.app",
        titulo="Museo del Prado",
        inicio=Momento(DIA, time(10, 0), MADRID),
        fin=Momento(DIA, time(12, 30), MADRID),
        horario="10:00 - 12:30",
        descripcion="Entrada, audioguía y café",
        direccion="Calle de Ruiz de Alarcón 23, Madrid",
        ubicacion="Calle de Ruiz de Alarcón 23, Madrid",
        url_mapa="https://www.google.com/maps/search/?api=1&query=40.41%2C-3.69",
    )
    return replace(base, **cambios)


def _traslado_ida():
    momento = Momento(DIA, time(8, 15), MADRID)
    return EventoItinerario(
        uid="actividad-9@cyanea.app",
        titulo="Avión a Madrid",
        inicio=momento,
        fin=momento,
        horario="08:15",
        descripcion="Vuelo IB6844",
        ubicacion="Madrid",
        linea_traslado="Avión · Llegada 08:15",
    )


def _itinerario(dias, generado_en=datetime(2026, 11, 6, 20, 30, tzinfo=timezone.utc)):
    return ItinerarioExportado(
        titulo="Escapada a Madrid",
        destinos="Madrid, España",
        fecha_inicio=DIA,
        fecha_fin=date(2026, 11, 11),
        dias=dias,
        generado_en=generado_en,
    )


def _lineas(contenido: bytes) -> list[str]:
    return contenido.decode("utf-8").replace("\r\n ", "").split("\r\n")


def test_con_recorrido_cada_dia_tiene_su_destino_y_el_dia_de_cambio_los_dos():
    lugares = lugares_por_fecha(
        [_destino(0, "Lisboa", 3), _destino(1, "Oporto", 2)], DIA, date(2026, 11, 15)
    )

    assert {fecha.day: lugar.etiqueta for fecha, lugar in lugares.items()} == {
        10: "Lisboa",
        11: "Lisboa",
        12: "Lisboa",
        13: "De Lisboa a Oporto",
        14: "Oporto",
        15: "Oporto",
    }
    cambio = lugares[date(2026, 11, 13)]
    assert cambio.origen.Nombre == "Lisboa"
    assert cambio.destino.Nombre == "Oporto"


def test_los_dias_completos_de_viaje_se_marcan_en_viaje():
    lugares = lugares_por_fecha(
        [_destino(0, "Lisboa", 2, en_viaje=2), _destino(1, "Madrid", 1)], DIA, date(2026, 11, 15)
    )

    assert lugares[date(2026, 11, 12)].etiqueta == "De Lisboa a Madrid"
    assert lugares[date(2026, 11, 13)].etiqueta == "En viaje a Madrid"
    assert lugares[date(2026, 11, 14)].etiqueta == "Madrid"
    assert lugares[date(2026, 11, 15)].etiqueta == "Madrid"


def test_sin_recorrido_armado_no_se_muestra_destino():
    lugares = lugares_por_fecha([_destino(0, "Lisboa", None)], DIA, date(2026, 11, 12))

    assert all(lugar.etiqueta is None for lugar in lugares.values())
    assert lugares[DIA].destino.Nombre == "Lisboa"


def test_hora_de_madrid_se_exporta_en_utc():
    assert formato_momento(Momento(DIA, time(10, 0), MADRID)) == "20261110T090000Z"
    assert formato_momento(Momento(DIA, time(10, 0), LISBOA)) == "20261110T100000Z"


def test_sin_zona_horaria_la_hora_queda_flotante():
    assert formato_momento(Momento(DIA, time(10, 0), None)) == "20261110T100000"


def test_ics_genera_un_evento_por_actividad_y_traslado():
    contenido = generar_ics(_itinerario([DiaItinerario(1, DIA, 1, "Madrid", [_traslado_ida(), _actividad()])]))
    lineas = _lineas(contenido)

    assert lineas[0] == "BEGIN:VCALENDAR"
    assert lineas.count("BEGIN:VEVENT") == 2
    assert "DTSTART:20261110T090000Z" in lineas
    assert "DTEND:20261110T113000Z" in lineas
    assert "SUMMARY:Museo del Prado" in lineas
    assert "LOCATION:Calle de Ruiz de Alarcón 23\\, Madrid" in lineas


def test_traslado_de_una_sola_hora_es_un_evento_sin_duracion():
    lineas = _lineas(generar_ics(_itinerario([DiaItinerario(1, DIA, 1, None, [_traslado_ida()])])))

    assert "DTSTART:20261110T071500Z" in lineas
    assert "DTEND:20261110T071500Z" in lineas


def test_fin_anterior_al_inicio_queda_sin_duracion():
    evento = _actividad(
        inicio=Momento(DIA, time(10, 0), LISBOA),
        fin=Momento(DIA, time(10, 30), MADRID),
    )
    lineas = _lineas(generar_ics(_itinerario([DiaItinerario(1, DIA, 1, None, [evento])])))

    assert "DTSTART:20261110T100000Z" in lineas
    assert "DTEND:20261110T100000Z" in lineas


def test_los_uid_no_cambian_entre_exportaciones():
    dias = [DiaItinerario(1, DIA, 1, None, [_traslado_ida(), _actividad()])]
    primera = generar_ics(_itinerario(dias))
    segunda = generar_ics(_itinerario(dias, datetime(2026, 11, 7, 9, 0, tzinfo=timezone.utc)))

    def uids(contenido):
        return [linea for linea in _lineas(contenido) if linea.startswith("UID:")]

    assert uids(primera) == uids(segunda) == [
        "UID:actividad-9@cyanea.app",
        "UID:actividad-7@cyanea.app",
    ]


def test_ics_pliega_lineas_largas_y_escapa_el_texto():
    descripcion = "Entrada, audioguía y café; " + "visita larga " * 20
    contenido = generar_ics(
        _itinerario([DiaItinerario(1, DIA, 1, None, [_actividad(descripcion=descripcion)])])
    )

    assert all(len(linea) <= 75 for linea in contenido.split(b"\r\n"))
    descripcion_ics = next(l for l in _lineas(contenido) if l.startswith("DESCRIPTION:"))
    assert descripcion_ics.startswith("DESCRIPTION:Entrada\\, audioguía y café\\; visita larga")
    assert "Cómo llegar: https://www.google.com/maps/search/" in descripcion_ics


def test_pdf_incluye_actividades_dias_libres_y_enlace_a_maps():
    dias = [
        DiaItinerario(1, DIA, 1, "Madrid", [_actividad()]),
        DiaItinerario(2, date(2026, 11, 11), 2, "Madrid", []),
    ]
    contenido = generar_pdf(_itinerario(dias), comprimir=False)

    assert contenido.startswith(b"%PDF-")
    assert b"Museo del Prado" in contenido
    assert b"libre" in contenido
    assert b"www.google.com/maps" in contenido


def test_pdf_no_falla_con_emojis():
    contenido = generar_pdf(
        _itinerario([DiaItinerario(1, DIA, 1, None, [_actividad(titulo="Museo 🎨")])])
    )

    assert contenido.startswith(b"%PDF-")


def test_nombre_del_archivo():
    assert nombre_archivo("Escapada a Madrid", "pdf") == "Itinerario - Escapada a Madrid.pdf"
    assert nombre_archivo('Viaje: "Europa"/26', "ics") == "Itinerario - Viaje Europa 26.ics"


def test_fechas_en_castellano():
    assert fecha_larga(DIA) == "Martes 10 de noviembre"
    assert rango_fechas(DIA, date(2026, 11, 15)) == "10 al 15 de noviembre de 2026"
    assert rango_fechas(date(2026, 12, 28), date(2027, 1, 3)) == (
        "28 de diciembre de 2026 al 3 de enero de 2027"
    )


def test_zona_horaria_desde_las_coordenadas():
    pytest.importorskip("timezonefinder")

    assert zona_horaria(40.4168, -3.7038) == MADRID
    assert zona_horaria(-31.4201, -64.1888) == "America/Argentina/Cordoba"
    assert zona_horaria(None, -3.7) is None
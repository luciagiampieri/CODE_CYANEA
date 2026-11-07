from datetime import date, datetime, time, timezone
from unittest.mock import AsyncMock

import pytest

from app.api.routes import exportar_itinerario as ruta
from app.models.actividad_itinerario import ActividadItinerario
from app.models.destino import Destino
from app.models.destino_viaje import DestinoViaje
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.tramo_traslado_viaje import TIPO_TRAMO_IDA, TramoTrasladoViaje
from app.services import exportar_itinerario as servicio
from tests.test_trips import _agregar_participante, _crear_usuario, _token_de

INICIO = date(2026, 12, 1)


@pytest.fixture(autouse=True)
def sin_portada(monkeypatch):
    monkeypatch.setattr(servicio, "descargar_portada", AsyncMock(return_value=None))


def _dia(db_session, viaje, fecha, indice):
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=fecha, IndiceDia=indice)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


def _actividad(db_session, dia, nombre="Visita al museo", inicio=time(10, 0), fin=time(12, 0), icono="camera", **extra):
    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        Nombre=nombre,
        HoraInicio=inicio,
        HoraFin=fin,
        Icono=icono,
        **extra,
    )
    db_session.add(actividad)
    db_session.commit()
    db_session.refresh(actividad)
    return actividad


def _destino(db_session, viaje, nombre="Madrid", pais="España", lat=40.4168, lng=-3.7038):
    destino = Destino(Nombre=nombre, Pais=pais, Lat=lat, Lng=lng)
    db_session.add(destino)
    db_session.flush()
    db_session.add(DestinoViaje(IdViaje=viaje.IdViaje, IdDestino=destino.IdDestino, Orden=0))
    db_session.commit()
    return destino


def _exportar(client, db_session, viaje, headers, **params):
    db_session.expire_all()
    return client.get(
        f"/api/v1/trips/{viaje.IdViaje}/itinerario/exportar", params=params, headers=headers
    )


def _lineas(respuesta):
    return respuesta.text.replace("\r\n ", "").split("\r\n")


def _valor(lineas, propiedad):
    return next(linea.split(":", 1)[1] for linea in lineas if linea.startswith(f"{propiedad}:"))


def test_exporta_el_itinerario_completo_en_pdf(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _actividad(db_session, _dia(db_session, viaje, INICIO, 1))

    respuesta = _exportar(client, db_session, viaje, auth_headers, formato="pdf")

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.headers["content-type"] == "application/pdf"
    assert respuesta.content.startswith(b"%PDF-")
    assert "Itinerario - Viaje de test.pdf" in respuesta.headers["content-disposition"]


def test_exporta_a_calendario_un_evento_por_actividad(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    actividad = _actividad(db_session, _dia(db_session, viaje, INICIO, 1))

    respuesta = _exportar(client, db_session, viaje, auth_headers, formato="ics")

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.headers["content-type"].startswith("text/calendar")
    lineas = _lineas(respuesta)
    assert lineas.count("BEGIN:VEVENT") == 1
    assert f"UID:actividad-{actividad.IdActividad}@cyanea.app" in lineas
    assert "SUMMARY:Visita al museo" in lineas


def test_el_calendario_usa_la_zona_horaria_del_destino(client, db_session, auth_headers, viaje_con_admin):
    pytest.importorskip("timezonefinder")
    viaje, _ = viaje_con_admin
    _destino(db_session, viaje)
    _actividad(db_session, _dia(db_session, viaje, INICIO, 1))

    lineas = _lineas(_exportar(client, db_session, viaje, auth_headers, formato="ics"))

    assert _valor(lineas, "DTSTART") == "20261201T090000Z"
    assert _valor(lineas, "DTEND") == "20261201T110000Z"


def test_el_traslado_de_ida_es_un_evento_sin_duracion(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _destino(db_session, viaje)
    dia = _dia(db_session, viaje, INICIO, 1)
    tramo = TramoTrasladoViaje(IdViaje=viaje.IdViaje, IdTipoTramoTraslado=TIPO_TRAMO_IDA)
    db_session.add(tramo)
    db_session.commit()
    _actividad(
        db_session, dia, nombre="Avión a Madrid", inicio=time(8, 15), fin=time(8, 15),
        icono="plane", IdTramoTraslado=tramo.IdTramoTraslado,
    )

    lineas = _lineas(_exportar(client, db_session, viaje, auth_headers, formato="ics"))

    assert "SUMMARY:Avión a Madrid" in lineas
    assert _valor(lineas, "DTSTART") == _valor(lineas, "DTEND")


def test_exporta_solo_los_dias_elegidos(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    primera = _actividad(db_session, _dia(db_session, viaje, INICIO, 1), nombre="Museo")
    segundo_dia = _dia(db_session, viaje, date(2026, 12, 2), 2)
    segunda = _actividad(db_session, segundo_dia, nombre="Parque")

    lineas = _lineas(
        _exportar(client, db_session, viaje, auth_headers, formato="ics", dias=[segundo_dia.IdDiaCronograma])
    )

    assert f"UID:actividad-{segunda.IdActividad}@cyanea.app" in lineas
    assert f"UID:actividad-{primera.IdActividad}@cyanea.app" not in lineas


def test_un_dia_que_no_es_del_viaje_da_error(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _actividad(db_session, _dia(db_session, viaje, INICIO, 1))

    respuesta = _exportar(client, db_session, viaje, auth_headers, formato="pdf", dias=[999999])

    assert respuesta.status_code == 404
    assert respuesta.headers["X-Error-Code"] == "DAY_NOT_FOUND"


def test_dias_sin_actividades_no_generan_archivo(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _dia(db_session, viaje, INICIO, 1)

    respuesta = _exportar(client, db_session, viaje, auth_headers, formato="pdf")

    assert respuesta.status_code == 422
    assert respuesta.headers["X-Error-Code"] == "ITINERARY_EMPTY"


def test_no_se_exporta_un_viaje_cancelado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _actividad(db_session, _dia(db_session, viaje, INICIO, 1))
    cancelado = db_session.query(EstadoViaje).filter_by(Nombre="cancelado").one()
    viaje.IdEstadoViaje = cancelado.IdEstadoViaje
    db_session.commit()

    respuesta = _exportar(client, db_session, viaje, auth_headers, formato="pdf")

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "TRIP_CANCELLED"


def test_un_usuario_ajeno_al_viaje_no_puede_exportar(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _actividad(db_session, _dia(db_session, viaje, INICIO, 1))
    ajeno = _crear_usuario(db_session, "ajeno_exportar")

    respuesta = _exportar(client, db_session, viaje, _token_de(ajeno), formato="pdf")

    assert respuesta.status_code == 403


@pytest.mark.parametrize("estado", ["invitado", "expulsado"])
def test_invitados_y_expulsados_no_pueden_exportar(client, db_session, viaje_con_admin, estado):
    viaje, _ = viaje_con_admin
    _actividad(db_session, _dia(db_session, viaje, INICIO, 1))
    usuario = _crear_usuario(db_session, f"exportar_{estado}")
    _agregar_participante(db_session, viaje, usuario, estado_nombre=estado)

    respuesta = _exportar(client, db_session, viaje, _token_de(usuario), formato="pdf")

    assert respuesta.status_code == 403


def test_un_participante_puede_exportar(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _actividad(db_session, _dia(db_session, viaje, INICIO, 1))
    usuario = _crear_usuario(db_session, "exportar_participante")
    _agregar_participante(db_session, viaje, usuario, estado_nombre="aceptado")

    respuesta = _exportar(client, db_session, viaje, _token_de(usuario), formato="ics")

    assert respuesta.status_code == 200, respuesta.text


def test_quien_abandono_exporta_lo_creado_hasta_su_salida(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    dia = _dia(db_session, viaje, INICIO, 1)
    anterior = _actividad(
        db_session, dia, nombre="Antes de salir", FechaCreacion=datetime(2026, 10, 1, tzinfo=timezone.utc)
    )
    posterior = _actividad(
        db_session, dia, nombre="Después de salir", inicio=time(15, 0), fin=time(16, 0),
        FechaCreacion=datetime(2026, 11, 5, tzinfo=timezone.utc),
    )
    usuario = _crear_usuario(db_session, "exportar_salio")
    _agregar_participante(db_session, viaje, usuario, estado_nombre="salio")
    participacion = (
        db_session.query(ParticipanteViaje)
        .filter_by(IdViaje=viaje.IdViaje, IdUsuario=usuario.IdUsuario)
        .one()
    )
    participacion.FechaSalida = datetime(2026, 11, 1, 12, 0)
    db_session.commit()

    respuesta = _exportar(client, db_session, viaje, _token_de(usuario), formato="ics")

    assert respuesta.status_code == 200, respuesta.text
    lineas = _lineas(respuesta)
    assert f"UID:actividad-{anterior.IdActividad}@cyanea.app" in lineas
    assert f"UID:actividad-{posterior.IdActividad}@cyanea.app" not in lineas


def test_si_falla_la_generacion_avisa_y_se_puede_reintentar(
    client, db_session, auth_headers, viaje_con_admin, monkeypatch
):
    viaje, _ = viaje_con_admin
    _actividad(db_session, _dia(db_session, viaje, INICIO, 1))
    generar_real = ruta.generar_pdf
    llamadas = []

    def generar_con_falla(itinerario):
        llamadas.append(itinerario)
        if len(llamadas) == 1:
            raise RuntimeError("Falla simulada")
        return generar_real(itinerario)

    monkeypatch.setattr(ruta, "generar_pdf", generar_con_falla)

    primera = _exportar(client, db_session, viaje, auth_headers, formato="pdf")
    segunda = _exportar(client, db_session, viaje, auth_headers, formato="pdf")

    assert primera.status_code == 500
    assert primera.headers["X-Error-Code"] == "EXPORT_FAILED"
    assert segunda.status_code == 200
    assert segunda.content.startswith(b"%PDF-")
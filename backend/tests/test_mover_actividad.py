from datetime import date, time, timedelta
from typing import get_args
from unittest.mock import AsyncMock

import pytest

from app.api.routes import trips as trips_module
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.recordatorio_actividad_notificado import RecordatorioActividadNotificado
from app.schemas.advertencia import TipoAdvertenciaHorarioLiteral
from tests.test_trips import _agregar_participante, _crear_usuario, _token_de

HOY = date.today()
TIPO_ADVERTENCIA = get_args(TipoAdvertenciaHorarioLiteral)[0]


@pytest.fixture(autouse=True)
def externos(monkeypatch):
    estado = {"resultado": {"advertencia": False}, "fechas": []}

    async def _analizar(**kwargs):
        estado["fechas"].append(kwargs.get("fecha"))
        return estado["resultado"]

    monkeypatch.setattr(trips_module, "analizar_horario_actividad", _analizar)
    estado["broadcast"] = AsyncMock()
    monkeypatch.setattr(trips_module.manager, "broadcast", estado["broadcast"])
    estado["notificar"] = AsyncMock()
    monkeypatch.setattr(trips_module, "dispatch_trip_notification", estado["notificar"])
    return estado


def _dia(db_session, viaje, fecha, indice):
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=fecha, IndiceDia=indice)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


def _actividad(db_session, dia, nombre="Visita al museo", inicio=time(10, 0), fin=time(12, 0), **extra):
    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        Nombre=nombre,
        HoraInicio=inicio,
        HoraFin=fin,
        Icono="camera",
        **extra,
    )
    db_session.add(actividad)
    db_session.commit()
    db_session.refresh(actividad)
    return actividad


@pytest.fixture
def dias(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    return (
        _dia(db_session, viaje, HOY + timedelta(days=10), 1),
        _dia(db_session, viaje, HOY + timedelta(days=11), 2),
    )


def _url(viaje, dia, actividad):
    return (
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}"
        f"/activities/{actividad.IdActividad}/mover"
    )


def _dia_de(db_session, actividad_id):
    db_session.expire_all()
    actividad = db_session.get(ActividadItinerario, actividad_id)
    return actividad.IdDiaCronograma if actividad else None


def test_mueve_la_actividad_conservando_horario_y_datos(
    client, db_session, auth_headers, viaje_con_admin, dias, externos
):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen, Descripcion="Llevar entradas")

    respuesta = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["IdActividad"] == actividad.IdActividad
    assert cuerpo["HoraInicio"].startswith("10:00")
    assert cuerpo["HoraFin"].startswith("12:00")
    assert cuerpo["Descripcion"] == "Llevar entradas"
    assert _dia_de(db_session, actividad.IdActividad) == destino.IdDiaCronograma


def test_valida_los_horarios_del_lugar_para_el_nuevo_dia(
    client, db_session, auth_headers, viaje_con_admin, dias, externos
):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen)

    client.patch(_url(viaje, origen, actividad), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers)

    assert externos["fechas"] == [destino.Fecha]


def test_si_el_lugar_esta_cerrado_pide_confirmacion_y_no_mueve(
    client, db_session, auth_headers, viaje_con_admin, dias, externos
):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen)
    externos["resultado"] = {
        "advertencia": True,
        "mensaje": "El museo está cerrado ese día.",
        "tipo": TIPO_ADVERTENCIA,
        "resumen": "Cerrado ese día",
        "nombre_lugar": "Museo",
    }

    respuesta = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["requiereConfirmacion"] is True
    assert cuerpo["advertencia"]["mensaje"] == "El museo está cerrado ese día."
    assert _dia_de(db_session, actividad.IdActividad) == origen.IdDiaCronograma


def test_al_confirmar_la_advertencia_se_mueve_y_queda_marcada(
    client, db_session, auth_headers, viaje_con_admin, dias, externos
):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen)

    respuesta = client.patch(
        _url(viaje, origen, actividad),
        json={
            "idDiaDestino": destino.IdDiaCronograma,
            "advertenciaHorario": {"tipo": TIPO_ADVERTENCIA, "resumen": "Cerrado ese día"},
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["AdvertenciaHorario"] == "Cerrado ese día"
    assert _dia_de(db_session, actividad.IdActividad) == destino.IdDiaCronograma
    assert externos["fechas"] == []


def test_quita_la_advertencia_vieja_si_el_nuevo_dia_no_tiene_problemas(
    client, db_session, auth_headers, viaje_con_admin, dias
):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(
        db_session, origen, TipoAdvertenciaHorario=TIPO_ADVERTENCIA, AdvertenciaHorario="Cerrado los lunes"
    )

    respuesta = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["AdvertenciaHorario"] is None


def test_superposicion_pide_confirmacion_y_al_confirmar_mueve(
    client, db_session, auth_headers, viaje_con_admin, dias
):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen, inicio=time(10, 0), fin=time(12, 0))
    _actividad(db_session, destino, nombre="Almuerzo", inicio=time(11, 30), fin=time(13, 0))

    sin_confirmar = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers
    )

    assert sin_confirmar.status_code == 200
    assert sin_confirmar.json()["requiereConfirmacion"] is True
    assert sin_confirmar.json()["superpuestas"] == ["Almuerzo"]
    assert _dia_de(db_session, actividad.IdActividad) == origen.IdDiaCronograma

    confirmado = client.patch(
        _url(viaje, origen, actividad),
        json={"idDiaDestino": destino.IdDiaCronograma, "confirmarSuperposicion": True},
        headers=auth_headers,
    )

    assert confirmado.status_code == 200, confirmado.text
    assert _dia_de(db_session, actividad.IdActividad) == destino.IdDiaCronograma


def test_al_moverla_vuelve_a_recordarse(client, db_session, auth_headers, viaje_con_admin, dias):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen)
    db_session.add(
        RecordatorioActividadNotificado(
            IdActividad=actividad.IdActividad, Tipo="inicio_actividad", MinutosAntes=60
        )
    )
    db_session.commit()

    respuesta = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers
    )

    assert respuesta.status_code == 200, respuesta.text
    db_session.expire_all()
    assert (
        db_session.query(RecordatorioActividadNotificado)
        .filter_by(IdActividad=actividad.IdActividad)
        .count()
        == 0
    )


def test_no_se_mueve_al_mismo_dia(client, db_session, auth_headers, viaje_con_admin, dias):
    viaje, _ = viaje_con_admin
    origen, _ = dias
    actividad = _actividad(db_session, origen)

    respuesta = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": origen.IdDiaCronograma}, headers=auth_headers
    )

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "ACTIVITY_SAME_DAY"


def test_no_se_mueve_a_un_dia_que_ya_paso(client, db_session, auth_headers, viaje_con_admin, dias):
    viaje, _ = viaje_con_admin
    origen, _ = dias
    pasado = _dia(db_session, viaje, HOY - timedelta(days=1), 0)
    actividad = _actividad(db_session, origen)

    respuesta = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": pasado.IdDiaCronograma}, headers=auth_headers
    )

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "DAY_IN_PAST"
    assert _dia_de(db_session, actividad.IdActividad) == origen.IdDiaCronograma


def test_no_se_mueve_a_un_dia_inexistente(client, db_session, auth_headers, viaje_con_admin, dias):
    viaje, _ = viaje_con_admin
    origen, _ = dias
    actividad = _actividad(db_session, origen)

    respuesta = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": 999999}, headers=auth_headers
    )

    assert respuesta.status_code == 404
    assert respuesta.headers["X-Error-Code"] == "DAY_NOT_FOUND"


def test_los_traslados_no_se_mueven(client, db_session, auth_headers, viaje_con_admin, dias):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    traslado = _actividad(db_session, origen, nombre="Avión a Bariloche", IdTramoTraslado=999)

    respuesta = client.patch(
        _url(viaje, origen, traslado), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "TRANSFER_CANNOT_MOVE"


def test_no_se_mueve_si_otra_persona_la_esta_editando(
    client, db_session, auth_headers, viaje_con_admin, dias, monkeypatch
):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen)
    monkeypatch.setattr(trips_module.manager, "obtener_usuario_editando", lambda trip_id, activity_id: 999999)

    respuesta = client.patch(
        _url(viaje, origen, actividad), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "ACTIVITY_BEING_EDITED"
    assert _dia_de(db_session, actividad.IdActividad) == origen.IdDiaCronograma


def test_un_participante_no_administrador_puede_moverla(client, db_session, viaje_con_admin, dias):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen)
    participante = _crear_usuario(db_session, "mueve_actividad")
    _agregar_participante(db_session, viaje, participante, estado_nombre="aceptado")

    respuesta = client.patch(
        _url(viaje, origen, actividad),
        json={"idDiaDestino": destino.IdDiaCronograma},
        headers=_token_de(participante),
    )

    assert respuesta.status_code == 200, respuesta.text


def test_un_usuario_ajeno_al_viaje_no_puede_moverla(client, db_session, viaje_con_admin, dias):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen)
    ajeno = _crear_usuario(db_session, "ajeno_mover")

    respuesta = client.patch(
        _url(viaje, origen, actividad),
        json={"idDiaDestino": destino.IdDiaCronograma},
        headers=_token_de(ajeno),
    )

    assert respuesta.status_code in (403, 404)
    assert _dia_de(db_session, actividad.IdActividad) == origen.IdDiaCronograma


def test_avisa_en_tiempo_real_y_notifica_al_grupo(
    client, db_session, auth_headers, viaje_con_admin, dias, externos
):
    viaje, _ = viaje_con_admin
    origen, destino = dias
    actividad = _actividad(db_session, origen)

    client.patch(_url(viaje, origen, actividad), json={"idDiaDestino": destino.IdDiaCronograma}, headers=auth_headers)

    eventos = [llamada.args[1] for llamada in externos["broadcast"].await_args_list]
    movida = next(e for e in eventos if e["tipo"] == "actividad_movida")
    assert movida["idDiaOrigen"] == origen.IdDiaCronograma
    assert movida["idDiaCronograma"] == destino.IdDiaCronograma
    externos["notificar"].assert_awaited_once()
    assert externos["notificar"].await_args.args[1].tipo == "actividad_movida"
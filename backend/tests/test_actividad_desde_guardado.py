"""Crear una actividad desde un lugar guardado del viaje (Nueva actividad).

Al elegir un guardado, la app manda `vincularGuardado=true`: la actividad queda vinculada
al guardado (IdLugarInteresViaje), igual que al agendarlo desde Explorar, y el guardado
figura en el itinerario. `scheduledDays` cuenta también las actividades que usan el mismo
lugar global (elegido en Google).
"""

from datetime import date, time
from unittest.mock import AsyncMock

import pytest

from app.api.routes import trips as trips_module
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.lugar_interes import LugarInteres
from app.models.lugar_interes_viaje import LugarInteresViaje
from app.services import route_generation


@pytest.fixture(autouse=True)
def externos(monkeypatch):
    async def _analizar(**kwargs):
        return {"advertencia": False}

    monkeypatch.setattr(trips_module, "analizar_horario_actividad", _analizar)
    monkeypatch.setattr(trips_module.manager, "broadcast", AsyncMock())
    monkeypatch.setattr(trips_module, "dispatch_trip_notification", AsyncMock())


def _dia(db_session, viaje, indice, fecha):
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=fecha, IndiceDia=indice)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


def _lugar(db_session, google_place_id="google:prado", nombre="Museo del Prado"):
    lugar = LugarInteres(
        GooglePlaceId=google_place_id,
        Nombre=nombre,
        Direccion="Madrid, España",
        Lat=40.41,
        Lng=-3.69,
        Categoria="museum",
    )
    db_session.add(lugar)
    db_session.commit()
    db_session.refresh(lugar)
    return lugar


def _guardar(db_session, viaje, usuario, lugar):
    guardado = LugarInteresViaje(
        IdViaje=viaje.IdViaje, IdLugarInteres=lugar.IdLugarInteres, IdUsuarioAlta=usuario.IdUsuario
    )
    db_session.add(guardado)
    db_session.commit()
    db_session.refresh(guardado)
    return guardado


def _crear_actividad(client, headers, viaje, dia, **extra):
    return client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}/activities",
        json={"nombre": "Museo del Prado", "horaInicio": "10:00:00", "horaFin": "12:00:00", **extra},
        headers=headers,
    )


def _guardado_en_lista(client, headers, viaje, lugar):
    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/places", headers=headers)
    assert response.status_code == 200
    return next(item for item in response.json() if item["id"] == lugar.IdLugarInteres)


def test_crear_eligiendo_un_guardado_vincula_la_actividad_y_figura_en_el_itinerario(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    dia = _dia(db_session, viaje, 1, date(2026, 12, 2))
    lugar = _lugar(db_session)
    guardado = _guardar(db_session, viaje, usuario_activo, lugar)

    response = _crear_actividad(
        client, auth_headers, viaje, dia, idLugarInteres=lugar.IdLugarInteres, vincularGuardado=True
    )

    assert response.status_code == 201
    body = response.json()
    assert body["IdLugarInteresViaje"] == guardado.IdLugarInteresViaje
    # La app sigue viendo el lugar como siempre.
    assert body["IdLugarInteres"] == lugar.IdLugarInteres
    assert body["LugarInteres"]["name"] == "Museo del Prado"

    actividad = db_session.get(ActividadItinerario, body["IdActividad"])
    assert actividad.IdLugarInteresViaje == guardado.IdLugarInteresViaje
    assert actividad.IdLugarInteres is None

    item = _guardado_en_lista(client, auth_headers, viaje, lugar)
    assert [dia["dayIndex"] for dia in item["scheduledDays"]] == [1]


def test_sin_vincular_guarda_el_lugar_global_y_igual_cuenta_en_scheduled_days(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    dia = _dia(db_session, viaje, 2, date(2026, 12, 3))
    lugar = _lugar(db_session)
    _guardar(db_session, viaje, usuario_activo, lugar)

    response = _crear_actividad(client, auth_headers, viaje, dia, idLugarInteres=lugar.IdLugarInteres)

    assert response.status_code == 201
    body = response.json()
    assert body["IdLugarInteresViaje"] is None
    actividad = db_session.get(ActividadItinerario, body["IdActividad"])
    assert actividad.IdLugarInteres == lugar.IdLugarInteres

    item = _guardado_en_lista(client, auth_headers, viaje, lugar)
    assert [dia["dayIndex"] for dia in item["scheduledDays"]] == [2]


def test_un_dia_con_dos_actividades_del_mismo_lugar_no_se_repite(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    dia = _dia(db_session, viaje, 1, date(2026, 12, 2))
    lugar = _lugar(db_session)
    _guardar(db_session, viaje, usuario_activo, lugar)

    _crear_actividad(client, auth_headers, viaje, dia, idLugarInteres=lugar.IdLugarInteres, vincularGuardado=True)
    _crear_actividad(
        client, auth_headers, viaje, dia, idLugarInteres=lugar.IdLugarInteres,
        horaInicio="15:00:00", horaFin="16:00:00",
    )

    item = _guardado_en_lista(client, auth_headers, viaje, lugar)
    assert [dia["dayIndex"] for dia in item["scheduledDays"]] == [1]


def test_un_lugar_que_no_esta_guardado_en_el_viaje_responde_404(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    dia = _dia(db_session, viaje, 1, date(2026, 12, 2))
    lugar = _lugar(db_session)

    response = _crear_actividad(
        client, auth_headers, viaje, dia, idLugarInteres=lugar.IdLugarInteres, vincularGuardado=True
    )

    assert response.status_code == 404
    assert response.headers["X-Error-Code"] == "SAVED_PLACE_NOT_FOUND"
    assert db_session.query(ActividadItinerario).count() == 0


def test_editar_vincula_y_desvincula_el_guardado(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    dia = _dia(db_session, viaje, 1, date(2026, 12, 2))
    lugar = _lugar(db_session)
    guardado = _guardar(db_session, viaje, usuario_activo, lugar)
    creada = _crear_actividad(client, auth_headers, viaje, dia).json()
    url = f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}/activities/{creada['IdActividad']}"
    base = {"nombre": "Museo del Prado", "horaInicio": "10:00:00", "horaFin": "12:00:00"}

    vinculada = client.put(
        url, json={**base, "idLugarInteres": lugar.IdLugarInteres, "vincularGuardado": True}, headers=auth_headers
    )
    assert vinculada.status_code == 200
    assert vinculada.json()["IdLugarInteresViaje"] == guardado.IdLugarInteresViaje

    # La ✕ de la app desvincula y limpia la ubicación.
    desvinculada = client.put(url, json=base, headers=auth_headers)
    assert desvinculada.status_code == 200
    actividad = db_session.get(ActividadItinerario, creada["IdActividad"])
    db_session.refresh(actividad)
    assert actividad.IdLugarInteresViaje is None
    assert actividad.IdLugarInteres is None


def test_una_actividad_vinculada_mantiene_su_lugar_en_el_detalle_y_en_la_ruta(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    dia = _dia(db_session, viaje, 1, date(2026, 12, 2))
    lugar = _lugar(db_session)
    _guardar(db_session, viaje, usuario_activo, lugar)
    creada = _crear_actividad(
        client, auth_headers, viaje, dia, idLugarInteres=lugar.IdLugarInteres, vincularGuardado=True
    ).json()

    detalle = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert detalle.status_code == 200
    actividades = [
        actividad
        for dia_detalle in detalle.json()["Cronograma"]
        for actividad in dia_detalle["Actividades"]
    ]
    leida = next(item for item in actividades if item["IdActividad"] == creada["IdActividad"])
    assert leida["LugarInteres"]["name"] == "Museo del Prado"
    assert leida["IdLugarInteresViaje"] is not None

    actividad = db_session.get(ActividadItinerario, creada["IdActividad"])
    # Las rutas del día resuelven el lugar por el guardado (IdLugarInteres queda en NULL).
    assert route_generation._resolver_lugar(actividad).IdLugarInteres == lugar.IdLugarInteres
    assert trips_module._id_lugar_actividad(actividad) == lugar.IdLugarInteres

"""US 138: separación de actividades y rutas por destino en un día de traslado."""

import asyncio
from datetime import date, time, timedelta
from unittest.mock import AsyncMock

import pytest

from app.api.routes import trips as trips_module
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.lugar_interes import LugarInteres
from app.models.ruta_diaria import RutaDiaria
from app.models.viaje import Viaje
from app.services import route_generation
from app.services.traslados import separar_actividades_dia

INICIO = date.today() + timedelta(days=30)
RESPUESTA_GOOGLE = {
    "status": "OK",
    "routes": [
        {
            "overview_polyline": {"points": "abc"},
            "legs": [{"distance": {"value": 1000}, "duration": {"value": 600}}],
        }
    ],
}


@pytest.fixture(autouse=True)
def _sin_servicios_externos(monkeypatch):
    monkeypatch.setattr(trips_module.manager, "broadcast_to_trip", AsyncMock())
    monkeypatch.setattr(trips_module.manager, "broadcast", AsyncMock())


@pytest.fixture()
def google(monkeypatch):
    mock = AsyncMock(return_value=RESPUESTA_GOOGLE)
    monkeypatch.setattr(route_generation, "_consultar_google_directions", mock)
    return mock


def _destino(nombre, noches=None, en_viaje=None):
    datos = {"name": nombre, "country": "Argentina", "placeId": f"place-{nombre}"}
    if noches is not None:
        datos["noches"] = noches
    if en_viaje is not None:
        datos["nochesEnViaje"] = en_viaje
    return datos


RECORRIDO = [_destino("Bariloche", 3, 0), _destino("Mendoza", 3, 1), _destino("Salta", 2, 0)]


def _fechas(noches=9):
    return {"startDate": str(INICIO), "endDate": str(INICIO + timedelta(days=noches))}


def _crear(client, headers, destinos=RECORRIDO):
    respuesta = client.post(
        "/api/v1/trips",
        json={
            "title": "Cuyo",
            "currency": "ARS",
            "destinations": destinos,
            "participantUserIds": [],
            "invitedEmails": [],
            **_fechas(),
        },
        headers=headers,
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()["id"]


def _detalle(client, headers, id_viaje):
    respuesta = client.get(f"/api/v1/trips/{id_viaje}", headers=headers)
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _id_dia(detalle, dias):
    fecha = str(INICIO + timedelta(days=dias))
    return next(d["IdDiaCronograma"] for d in detalle["Cronograma"] if d["Fecha"] == fecha)


def _tramo_a(detalle, llegada):
    return next(t for t in detalle["traslados"] if t["nombreLlegada"] == llegada)


def _agendar(client, headers, id_viaje, tramo, salida="11:40:00", llegada="13:35:00"):
    respuesta = client.post(
        f"/api/v1/trips/{id_viaje}/traslados",
        json={
            "tramo": {
                "tipo": tramo["tipo"],
                "idDestinoOrigen": tramo["idDestinoOrigen"],
                "idDestinoLlegada": tramo["idDestinoLlegada"],
            },
            "medio": "plane",
            "horaSalida": salida,
            "horaLlegada": llegada,
            "confirmarSuperposicion": True,
        },
        headers=headers,
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["idActividad"]


def _lugar(db_session, nombre):
    lugar = LugarInteres(
        GooglePlaceId=f"place-{nombre}",
        Nombre=nombre,
        Direccion="Calle 123",
        Lat=-31.4,
        Lng=-64.2,
        Categoria="atraccion",
    )
    db_session.add(lugar)
    db_session.commit()
    return lugar


def _actividad(db_session, id_dia, nombre, inicio, fin, con_lugar=True):
    actividad = ActividadItinerario(
        IdDiaCronograma=id_dia,
        Nombre=nombre,
        HoraInicio=inicio,
        HoraFin=fin,
        IdLugarInteres=_lugar(db_session, nombre).IdLugarInteres if con_lugar else None,
    )
    db_session.add(actividad)
    db_session.commit()
    return actividad


def _generar(client, headers, id_viaje, id_dia):
    return client.post(f"/api/v1/trips/{id_viaje}/days/{id_dia}/route", headers=headers)


def _dia_de_traslado(client, headers, db_session, agendado=True):
    id_viaje = _crear(client, headers)
    detalle = _detalle(client, headers, id_viaje)
    id_dia = _id_dia(detalle, 3)
    if agendado:
        _agendar(client, headers, id_viaje, _tramo_a(detalle, "Mendoza"))
    return id_viaje, id_dia, detalle


def _separacion(db_session, id_viaje, id_dia):
    db_session.expire_all()
    viaje = db_session.get(Viaje, id_viaje)
    dia = next(d for d in viaje.Cronograma if d.IdDiaCronograma == id_dia)
    return separar_actividades_dia(viaje, dia)


# --- Separación por destino --------------------------------------------------------


def test_separa_lo_anterior_a_la_salida_y_lo_posterior(
    client, db_session, master_data, auth_headers
):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session)
    _actividad(db_session, id_dia, "Desayuno", time(9), time(10))
    _actividad(db_session, id_dia, "Cena", time(20), time(21))

    separacion = _separacion(db_session, id_viaje, id_dia)

    assert separacion.agendado is True
    assert [a.Nombre for a in separacion.antes] == ["Desayuno"]
    assert [a.Nombre for a in separacion.despues] == ["Cena"]


def test_lo_que_empieza_durante_el_viaje_va_al_destino_de_llegada(
    client, db_session, master_data, auth_headers
):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session)
    _actividad(db_session, id_dia, "En el medio", time(12), time(14))
    _actividad(db_session, id_dia, "Justo a la salida", time(11, 40), time(12))

    separacion = _separacion(db_session, id_viaje, id_dia)

    assert separacion.antes == []
    assert sorted(a.Nombre for a in separacion.despues) == ["En el medio", "Justo a la salida"]


def test_el_traslado_no_cuenta_como_actividad_de_ningun_grupo(
    client, db_session, master_data, auth_headers
):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session)

    separacion = _separacion(db_session, id_viaje, id_dia)

    assert separacion.antes == [] and separacion.despues == []


def test_sin_traslado_agendado_no_reparte(client, db_session, master_data, auth_headers):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session, agendado=False)
    _actividad(db_session, id_dia, "Desayuno", time(9), time(10))

    separacion = _separacion(db_session, id_viaje, id_dia)

    assert separacion.agendado is False
    assert separacion.antes == [] and separacion.despues == []


def test_un_dia_normal_o_con_noches_en_viaje_no_se_separa(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers)
    detalle = _detalle(client, auth_headers, id_viaje)

    assert _separacion(db_session, id_viaje, _id_dia(detalle, 1)) is None
    # Mendoza -> Salta tiene una noche en viaje: el día de salida es del origen.
    assert _separacion(db_session, id_viaje, _id_dia(detalle, 6)) is None


# --- Rutas -------------------------------------------------------------------------


def test_cp12_calcula_una_ruta_por_destino(client, db_session, master_data, auth_headers, google):
    id_viaje, id_dia, detalle = _dia_de_traslado(client, auth_headers, db_session)
    a = _actividad(db_session, id_dia, "A", time(8), time(9))
    b = _actividad(db_session, id_dia, "B", time(9, 30), time(10))
    c = _actividad(db_session, id_dia, "C", time(15), time(16))
    d = _actividad(db_session, id_dia, "D", time(17), time(18))

    respuesta = _generar(client, auth_headers, id_viaje, id_dia)

    assert respuesta.status_code == 200, respuesta.text
    rutas = respuesta.json()["rutas"]
    assert [r["NombreDestino"] for r in rutas] == ["Bariloche", "Mendoza"]
    assert rutas[0]["IdsActividadesOrdenadas"] == [a.IdActividad, b.IdActividad]
    assert rutas[1]["IdsActividadesOrdenadas"] == [c.IdActividad, d.IdActividad]
    assert google.await_count == 2


def test_el_detalle_devuelve_las_dos_rutas(client, db_session, master_data, auth_headers, google):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session)
    for nombre, hora in (("A", 8), ("B", 9), ("C", 15), ("D", 17)):
        _actividad(db_session, id_dia, nombre, time(hora), time(hora, 30))
    _generar(client, auth_headers, id_viaje, id_dia)

    detalle = _detalle(client, auth_headers, id_viaje)
    dia = next(d for d in detalle["Cronograma"] if d["IdDiaCronograma"] == id_dia)

    assert len(dia["Rutas"]) == 2
    assert dia["Ruta"]["NombreDestino"] == "Bariloche"


def test_un_destino_sin_actividades_suficientes_solo_genera_el_otro(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session)
    _actividad(db_session, id_dia, "A", time(8), time(9))
    _actividad(db_session, id_dia, "C", time(15), time(16))
    _actividad(db_session, id_dia, "D", time(17), time(18))

    respuesta = _generar(client, auth_headers, id_viaje, id_dia)

    assert [r["NombreDestino"] for r in respuesta.json()["rutas"]] == ["Mendoza"]


def test_sin_suficientes_en_ningun_destino_falla(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session)
    _actividad(db_session, id_dia, "A", time(8), time(9))
    _actividad(db_session, id_dia, "C", time(15), time(16))

    respuesta = _generar(client, auth_headers, id_viaje, id_dia)

    assert respuesta.status_code == 422
    assert "alguno de los destinos" in respuesta.json()["detail"]
    google.assert_not_awaited()


def test_sin_traslado_agendado_no_genera_ruta(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session, agendado=False)
    _actividad(db_session, id_dia, "A", time(8), time(9))
    _actividad(db_session, id_dia, "B", time(15), time(16))

    respuesta = _generar(client, auth_headers, id_viaje, id_dia)

    assert respuesta.status_code == 422
    assert respuesta.json()["detail"] == route_generation.MENSAJE_TRASLADO_SIN_AGENDAR
    google.assert_not_awaited()


def test_si_falla_google_no_cambian_las_rutas_guardadas(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session)
    for nombre, hora in (("A", 8), ("B", 9), ("C", 15), ("D", 17)):
        _actividad(db_session, id_dia, nombre, time(hora), time(hora, 30))
    _generar(client, auth_headers, id_viaje, id_dia)
    google.side_effect = [RESPUESTA_GOOGLE, route_generation.RutaProviderError("Falló")]

    respuesta = _generar(client, auth_headers, id_viaje, id_dia)

    assert respuesta.status_code == 502
    assert db_session.query(RutaDiaria).filter_by(IdDiaCronograma=id_dia).count() == 2


def test_un_dia_normal_mantiene_una_sola_ruta_sin_destino(
    client, db_session, master_data, auth_headers, google
):
    id_viaje = _crear(client, auth_headers)
    id_dia = _id_dia(_detalle(client, auth_headers, id_viaje), 1)
    _actividad(db_session, id_dia, "A", time(8), time(9))
    _actividad(db_session, id_dia, "B", time(15), time(16))

    respuesta = _generar(client, auth_headers, id_viaje, id_dia)

    assert [r["IdDestino"] for r in respuesta.json()["rutas"]] == [None]


def test_agendar_el_traslado_reparte_una_ruta_que_ya_existia(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, detalle = _dia_de_traslado(client, auth_headers, db_session, agendado=False)
    for nombre, hora in (("A", 8), ("B", 9), ("C", 15), ("D", 17)):
        _actividad(db_session, id_dia, nombre, time(hora), time(hora, 30))
    db_session.add(
        RutaDiaria(
            IdDiaCronograma=id_dia,
            PolilineaCodificada="vieja",
            DistanciaMetros=1,
            DuracionSegundos=1,
            IdsActividadesOrdenadas=[],
        )
    )
    db_session.commit()

    _agendar(client, auth_headers, id_viaje, _tramo_a(detalle, "Mendoza"))

    db_session.expire_all()
    rutas = db_session.query(RutaDiaria).filter_by(IdDiaCronograma=id_dia).all()
    assert len(rutas) == 2
    assert all(r.IdDestino is not None for r in rutas)


def test_cambiar_el_recorrido_descarta_las_rutas_que_ya_no_corresponden(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, _ = _dia_de_traslado(client, auth_headers, db_session)
    for nombre, hora in (("A", 8), ("B", 9), ("C", 15), ("D", 17)):
        _actividad(db_session, id_dia, nombre, time(hora), time(hora, 30))
    _generar(client, auth_headers, id_viaje, id_dia)

    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}",
        json={
            "title": "Cuyo",
            "destinations": [
                _destino("Bariloche", 4, 0),
                _destino("Mendoza", 2, 1),
                _destino("Salta", 2, 0),
            ],
            **_fechas(),
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    assert db_session.query(RutaDiaria).filter_by(IdDiaCronograma=id_dia).count() == 0
    google.reset_mock()


def test_una_ruta_normal_se_conserva_si_el_dia_sigue_igual(
    client, db_session, master_data, auth_headers, google
):
    id_viaje = _crear(client, auth_headers)
    id_dia = _id_dia(_detalle(client, auth_headers, id_viaje), 1)
    _actividad(db_session, id_dia, "A", time(8), time(9))
    _actividad(db_session, id_dia, "B", time(15), time(16))
    _generar(client, auth_headers, id_viaje, id_dia)

    client.put(
        f"/api/v1/trips/{id_viaje}",
        json={"title": "Otro título", "destinations": RECORRIDO, **_fechas()},
        headers=auth_headers,
    )

    assert db_session.query(RutaDiaria).filter_by(IdDiaCronograma=id_dia).count() == 1


def test_cp13_cambiar_el_recorrido_avisa_en_tiempo_real(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers)

    client.put(
        f"/api/v1/trips/{id_viaje}",
        json={
            "title": "Cuyo",
            "destinations": [
                _destino("Bariloche", 4, 0),
                _destino("Mendoza", 2, 1),
                _destino("Salta", 2, 0),
            ],
            **_fechas(),
        },
        headers=auth_headers,
    )

    tipos = [
        llamada.args[1]["tipo"]
        for llamada in trips_module.manager.broadcast_to_trip.await_args_list
    ]
    assert "viaje_actualizado" in tipos


def test_cp9_se_puede_agregar_una_actividad_en_un_dia_en_viaje(
    client, db_session, master_data, auth_headers, monkeypatch
):
    monkeypatch.setattr(
        trips_module, "analizar_horario_actividad", AsyncMock(return_value={"advertencia": False})
    )
    destinos = [_destino("Bariloche", 3, 2), _destino("Mendoza", 4, 0)]
    id_viaje = _crear(client, auth_headers, destinos)
    id_dia = _id_dia(_detalle(client, auth_headers, id_viaje), 4)

    respuesta = client.post(
        f"/api/v1/trips/{id_viaje}/days/{id_dia}/activities",
        json={"nombre": "Parada en ruta", "horaInicio": "10:00:00", "horaFin": "11:00:00"},
        headers=auth_headers,
    )

    assert respuesta.status_code == 201, respuesta.text


# --- Modo por destino --------------------------------------------------------------


def _dia_con_dos_rutas(client, headers, db_session):
    id_viaje, id_dia, detalle = _dia_de_traslado(client, headers, db_session)
    for nombre, hora in (("A", 8), ("B", 9), ("C", 15), ("D", 17)):
        _actividad(db_session, id_dia, nombre, time(hora), time(hora, 30))
    respuesta = _generar(client, headers, id_viaje, id_dia)
    assert respuesta.status_code == 200, respuesta.text
    tramo = _tramo_a(detalle, "Mendoza")
    return id_viaje, id_dia, tramo["idDestinoOrigen"], tramo["idDestinoLlegada"]


def _generar_destino(client, headers, id_viaje, id_dia, id_destino, modo):
    return client.post(
        f"/api/v1/trips/{id_viaje}/days/{id_dia}/route",
        json={"modo": modo, "idDestino": id_destino},
        headers=headers,
    )


def _modos(db_session, id_dia):
    db_session.expire_all()
    rutas = db_session.query(RutaDiaria).filter_by(IdDiaCronograma=id_dia).all()
    return {r.IdDestino: r.Modo for r in rutas}


def test_recalcula_solo_la_ruta_de_un_destino_con_su_modo(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, salida, llegada = _dia_con_dos_rutas(client, auth_headers, db_session)
    google.reset_mock()

    respuesta = _generar_destino(client, auth_headers, id_viaje, id_dia, llegada, "driving")

    assert respuesta.status_code == 200, respuesta.text
    assert google.await_count == 1
    assert [r["IdDestino"] for r in respuesta.json()["rutas"]] == [llegada]
    assert _modos(db_session, id_dia) == {salida: "walking", llegada: "driving"}


def test_un_destino_ajeno_al_dia_falla(client, db_session, master_data, auth_headers, google):
    id_viaje, id_dia, _, _ = _dia_con_dos_rutas(client, auth_headers, db_session)

    respuesta = _generar_destino(client, auth_headers, id_viaje, id_dia, 999999, "driving")

    assert respuesta.status_code == 422
    assert respuesta.json()["detail"] == route_generation.MENSAJE_DESTINO_AJENO


def test_un_dia_normal_no_acepta_un_destino(client, db_session, master_data, auth_headers, google):
    id_viaje = _crear(client, auth_headers)
    id_dia = _id_dia(_detalle(client, auth_headers, id_viaje), 1)
    _actividad(db_session, id_dia, "A", time(8), time(9))
    _actividad(db_session, id_dia, "B", time(15), time(16))

    respuesta = _generar_destino(client, auth_headers, id_viaje, id_dia, 1, "driving")

    assert respuesta.status_code == 422


def test_sincronizar_mantiene_el_modo_de_cada_destino(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, salida, llegada = _dia_con_dos_rutas(client, auth_headers, db_session)
    _generar_destino(client, auth_headers, id_viaje, id_dia, llegada, "driving")
    dia = db_session.get(DiaCronograma, id_dia)

    asyncio.run(route_generation.sincronizar_ruta_tras_cambio_actividad(db_session, dia))

    assert _modos(db_session, id_dia) == {salida: "walking", llegada: "driving"}


def test_sin_destino_sigue_recalculando_las_dos_con_el_mismo_modo(
    client, db_session, master_data, auth_headers, google
):
    id_viaje, id_dia, salida, llegada = _dia_con_dos_rutas(client, auth_headers, db_session)

    respuesta = client.post(
        f"/api/v1/trips/{id_viaje}/days/{id_dia}/route",
        json={"modo": "bicycling"},
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    assert _modos(db_session, id_dia) == {salida: "bicycling", llegada: "bicycling"}

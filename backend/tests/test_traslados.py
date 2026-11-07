"""US 136: agendar traslados. Los casos de prueba de la US se mapean como CP1 a CP18."""

from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.routes import trips as trips_module
from app.api.routes import traslados as rutas_traslados
from app.core.security import create_access_token, hash_password
from app.models.actividad_itinerario import ActividadItinerario
from app.models.destino import Destino
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.tramo_traslado_viaje import TramoTrasladoViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import route_generation
from app.services.activity_ai.context import intervalo_actividad
from app.services.notifications.activity_reminders import _load_candidate_activities
from app.services.recorrido_viaje import calcular_tramos
from app.services.traslados import dias_en_viaje, nombre_traslado, ocupacion_traslados
from app.models.tramo_traslado_viaje import (
    TIPO_TRAMO_ENTRE_DESTINOS,
    TIPO_TRAMO_IDA,
    TIPO_TRAMO_REGRESO,
)

INICIO = date.today() + timedelta(days=30)


@pytest.fixture(autouse=True)
def _broadcast(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(trips_module.manager, "broadcast_to_trip", AsyncMock())
    monkeypatch.setattr(trips_module.manager, "broadcast", mock)
    return mock


def _destino(nombre, noches=None, en_viaje=None):
    datos = {"name": nombre, "country": "Argentina", "placeId": f"place-{nombre}"}
    if noches is not None:
        datos["noches"] = noches
    if en_viaje is not None:
        datos["nochesEnViaje"] = en_viaje
    return datos


def _fechas(noches=9, inicio=INICIO):
    return {"startDate": str(inicio), "endDate": str(inicio + timedelta(days=noches))}


def _crear(client, headers, destinos, noches=9):
    respuesta = client.post(
        "/api/v1/trips",
        json={
            "title": "Cuyo y Patagonia",
            "currency": "ARS",
            "destinations": destinos,
            "participantUserIds": [],
            "invitedEmails": [],
            **_fechas(noches),
        },
        headers=headers,
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()["id"]


def _editar(client, headers, id_viaje, destinos, noches=9, inicio=INICIO):
    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}",
        json={"title": "Cuyo y Patagonia", "destinations": destinos, **_fechas(noches, inicio)},
        headers=headers,
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta


def _detalle(client, headers, id_viaje):
    respuesta = client.get(f"/api/v1/trips/{id_viaje}", headers=headers)
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _tramo(detalle, tipo, llegada=None):
    return next(
        t
        for t in detalle["traslados"]
        if t["tipo"] == tipo and (llegada is None or t["nombreLlegada"] == llegada)
    )


def _ref(tramo):
    return {
        "tipo": tramo["tipo"],
        "idDestinoOrigen": tramo["idDestinoOrigen"],
        "idDestinoLlegada": tramo["idDestinoLlegada"],
    }


def _agendar(client, headers, id_viaje, tramo, **datos):
    return client.post(
        f"/api/v1/trips/{id_viaje}/traslados",
        json={"tramo": _ref(tramo), "medio": "plane", **datos},
        headers=headers,
    )


def _agendado(respuesta):
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["guardado"] is True, respuesta.text
    return respuesta.json()["idActividad"]


def _dia_de(detalle, fecha):
    return next(d for d in detalle["Cronograma"] if d["Fecha"] == str(fecha))


def _actividad_en(detalle, id_actividad):
    for dia in detalle["Cronograma"]:
        for actividad in dia["Actividades"]:
            if actividad["IdActividad"] == id_actividad:
                return dia, actividad
    raise AssertionError("La actividad no está en el itinerario")


def _crear_actividad(db_session, id_dia, nombre, inicio, fin):
    actividad = ActividadItinerario(
        IdDiaCronograma=id_dia, Nombre=nombre, HoraInicio=inicio, HoraFin=fin
    )
    db_session.add(actividad)
    db_session.commit()
    return actividad


def _rechazo(respuesta, estado, codigo):
    assert respuesta.status_code == estado, respuesta.text
    assert respuesta.headers["X-Error-Code"] == codigo


def _participante(db_session, id_viaje, estado="aceptado"):
    usuario = Usuario(
        Nombre="Part",
        Apellido="Test",
        NombreUsuario="participante_traslados",
        Email="participante_traslados@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.add(
        ParticipanteViaje(
            IdViaje=id_viaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=db_session.query(RolParticipante)
            .filter_by(Nombre="participante")
            .first()
            .IdRolParticipante,
            IdEstadoParticipacion=db_session.query(EstadoParticipacion)
            .filter_by(Nombre=estado)
            .first()
            .IdEstadoParticipacion,
        )
    )
    db_session.commit()
    return {"Authorization": f"Bearer {create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})}"}


RECORRIDO = [_destino("Bariloche", 3, 0), _destino("Mendoza", 3, 1), _destino("Salta", 2, 0)]


# --- Tramos ofrecidos --------------------------------------------------------------


def test_cp1_primer_dia_ofrece_la_llegada_al_primer_destino(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)

    detalle = _detalle(client, auth_headers, id_viaje)
    ida = _tramo(detalle, "ida")

    assert ida["estado"] == "pendiente"
    assert ida["nombreLlegada"] == "Bariloche"
    assert ida["fechaLlegada"] == str(INICIO)
    assert ida["idDiaCronograma"] == _dia_de(detalle, INICIO)["IdDiaCronograma"]


def test_ofrece_ida_un_tramo_por_par_consecutivo_y_regreso(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)

    tramos = _detalle(client, auth_headers, id_viaje)["traslados"]

    assert [(t["tipo"], t["nombreOrigen"], t["nombreLlegada"]) for t in tramos] == [
        ("ida", None, "Bariloche"),
        ("entre_destinos", "Bariloche", "Mendoza"),
        ("entre_destinos", "Mendoza", "Salta"),
        ("regreso", "Salta", None),
    ]
    assert tramos[1]["fechaSalida"] == str(INICIO + timedelta(days=3))
    assert tramos[2]["fechaSalida"] == str(INICIO + timedelta(days=6))
    assert tramos[2]["fechaLlegada"] == str(INICIO + timedelta(days=7))
    assert tramos[3]["fechaSalida"] == str(INICIO + timedelta(days=9))


def test_cp6_viaje_de_un_destino_solo_ofrece_ida_y_regreso(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, [_destino("Mendoza")])

    tramos = _detalle(client, auth_headers, id_viaje)["traslados"]

    assert [t["tipo"] for t in tramos] == ["ida", "regreso"]


def test_recorrido_sin_armar_solo_ofrece_ida_y_regreso(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, [_destino("Mendoza"), _destino("Salta")])

    tramos = _detalle(client, auth_headers, id_viaje)["traslados"]

    assert [t["tipo"] for t in tramos] == ["ida", "regreso"]


# --- Agendar -----------------------------------------------------------------------


def test_cp2_agenda_la_ida_con_la_hora_de_llegada(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")

    id_actividad = _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="13:35:00"))

    detalle = _detalle(client, auth_headers, id_viaje)
    dia, actividad = _actividad_en(detalle, id_actividad)
    assert dia["Fecha"] == str(INICIO)
    assert actividad["Nombre"] == "Avión a Bariloche"
    assert actividad["HoraFin"] == "13:35:00"
    assert actividad["Traslado"]["tipo"] == "ida"
    assert _tramo(detalle, "ida")["estado"] == "agendado"


def test_cp3_avion_entre_destinos_el_mismo_dia(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")

    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )

    dia, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert dia["Fecha"] == str(INICIO + timedelta(days=3))
    assert actividad["Nombre"] == "Avión a Mendoza"
    assert (actividad["HoraInicio"], actividad["HoraFin"]) == ("11:40:00", "13:35:00")
    assert actividad["Traslado"]["fechaLlegada"] == actividad["Traslado"]["fechaSalida"]


def test_cp4_micro_con_una_noche_en_viaje_llega_al_dia_siguiente(
    client, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Salta")

    id_actividad = _agendado(
        _agendar(
            client,
            auth_headers,
            id_viaje,
            tramo,
            medio="bus",
            horaSalida="22:00:00",
            horaLlegada="08:00:00",
        )
    )

    dia, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert dia["Fecha"] == str(INICIO + timedelta(days=6))
    assert actividad["Nombre"] == "Micro a Salta"
    assert actividad["HoraInicio"] == "22:00:00"
    assert actividad["HoraFin"] == "08:00:00"
    assert actividad["Traslado"]["fechaLlegada"] == str(INICIO + timedelta(days=7))
    assert actividad["Traslado"]["revisarHorario"] is False


def test_cp5_agenda_el_regreso_con_la_hora_de_salida(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    regreso = _tramo(_detalle(client, auth_headers, id_viaje), "regreso")

    id_actividad = _agendado(
        _agendar(client, auth_headers, id_viaje, regreso, medio="car", horaSalida="18:00:00")
    )

    dia, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert dia["Fecha"] == str(INICIO + timedelta(days=9))
    assert actividad["Nombre"] == "Auto de regreso"
    assert actividad["HoraInicio"] == "18:00:00"


def test_cp7_las_notas_se_guardan_en_el_detalle(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")

    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, ida, horaLlegada="10:00:00", notas="  Vuelo AR1234 "
        )
    )

    _, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert actividad["Descripcion"] == "Vuelo AR1234"


@pytest.mark.parametrize(
    ("medio", "tipo", "esperado"),
    [
        ("plane", TIPO_TRAMO_IDA, "Avión a Mendoza"),
        ("bus", TIPO_TRAMO_ENTRE_DESTINOS, "Micro a Mendoza"),
        ("ship", TIPO_TRAMO_ENTRE_DESTINOS, "Barco a Mendoza"),
        ("person-walking", TIPO_TRAMO_IDA, "Caminando a Mendoza"),
        ("route", TIPO_TRAMO_IDA, "Traslado a Mendoza"),
        ("train", TIPO_TRAMO_REGRESO, "Tren de regreso"),
        ("ship", TIPO_TRAMO_REGRESO, "Barco de regreso"),
        ("route", TIPO_TRAMO_REGRESO, "Traslado de regreso"),
        ("person-walking", TIPO_TRAMO_REGRESO, "Caminando de regreso"),
    ],
)
def test_nombre_automatico(medio, tipo, esperado):
    assert nombre_traslado(medio, tipo, "Mendoza") == esperado


# --- Validaciones ------------------------------------------------------------------


def test_cp15_sin_medio_de_transporte_falla(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")

    respuesta = _agendar(client, auth_headers, id_viaje, ida, medio=None, horaLlegada="10:00:00")

    _rechazo(respuesta, 400, "TRANSFER_MEDIUM_REQUIRED")


def test_medio_que_no_existe_falla(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")

    respuesta = _agendar(
        client, auth_headers, id_viaje, ida, medio="location-dot", horaLlegada="10:00:00"
    )

    _rechazo(respuesta, 400, "TRANSFER_MEDIUM_REQUIRED")


@pytest.mark.parametrize(
    ("tipo", "horas"),
    [
        ("ida", {"horaSalida": "10:00:00"}),
        ("regreso", {"horaLlegada": "10:00:00"}),
        ("entre_destinos", {"horaSalida": "10:00:00"}),
        ("entre_destinos", {"horaLlegada": "10:00:00"}),
    ],
)
def test_cada_tramo_exige_sus_horas(client, master_data, auth_headers, tipo, horas):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), tipo)

    _rechazo(
        _agendar(client, auth_headers, id_viaje, tramo, **horas), 400, "TRANSFER_TIME_REQUIRED"
    )


@pytest.mark.parametrize("llegada", ["09:00:00", "11:40:00"])
def test_cp16_mismo_dia_con_llegada_no_posterior_falla(
    client, master_data, auth_headers, llegada
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")

    respuesta = _agendar(
        client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada=llegada
    )

    _rechazo(respuesta, 400, "TRANSFER_TIME_INVALID")


def test_cp17_un_solo_traslado_por_tramo(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))

    respuesta = _agendar(client, auth_headers, id_viaje, ida, horaLlegada="12:00:00")

    _rechazo(respuesta, 409, "TRANSFER_ALREADY_EXISTS")


def test_cp18_no_se_puede_indicar_la_fecha_de_llegada(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")

    respuesta = _agendar(
        client,
        auth_headers,
        id_viaje,
        ida,
        horaLlegada="10:00:00",
        fechaLlegada=str(INICIO + timedelta(days=1)),
    )

    assert respuesta.status_code == 422


def test_tramo_que_no_es_del_recorrido_falla(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramos = _detalle(client, auth_headers, id_viaje)["traslados"]
    invertido = {
        "tipo": "entre_destinos",
        "idDestinoOrigen": tramos[1]["idDestinoLlegada"],
        "idDestinoLlegada": tramos[1]["idDestinoOrigen"],
    }

    respuesta = _agendar(
        client, auth_headers, id_viaje, invertido, horaSalida="10:00:00", horaLlegada="11:00:00"
    )

    _rechazo(respuesta, 409, "TRANSFER_SEGMENT_NOT_AVAILABLE")


# --- Permisos ----------------------------------------------------------------------


def test_cualquier_participante_agenda_edita_oculta_y_elimina(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    headers = _participante(db_session, id_viaje)
    detalle = _detalle(client, headers, id_viaje)
    ida = _tramo(detalle, "ida")

    id_actividad = _agendado(_agendar(client, headers, id_viaje, ida, horaLlegada="10:00:00"))
    assert (
        client.put(
            f"/api/v1/trips/{id_viaje}/traslados/{id_actividad}",
            json={"medio": "bus", "horaLlegada": "11:00:00"},
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/trips/{id_viaje}/traslados/ocultar",
            json={"tramo": _ref(_tramo(detalle, "regreso"))},
            headers=headers,
        ).status_code
        == 200
    )
    dia, _ = _actividad_en(_detalle(client, headers, id_viaje), id_actividad)
    assert (
        client.delete(
            f"/api/v1/trips/{id_viaje}/days/{dia['IdDiaCronograma']}/activities/{id_actividad}",
            headers=headers,
        ).status_code
        == 200
    )


def test_invitado_sin_aceptar_no_puede_agendar(client, db_session, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    headers = _participante(db_session, id_viaje, estado="invitado")

    respuesta = _agendar(client, headers, id_viaje, ida, horaLlegada="10:00:00")

    assert respuesta.status_code == 403


def test_viaje_finalizado_no_permite_agendar(client, db_session, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    viaje = db_session.get(Viaje, id_viaje)
    viaje.FechaInicio = date.today() - timedelta(days=10)
    viaje.FechaFin = date.today() - timedelta(days=1)
    db_session.commit()

    respuesta = _agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00")

    _rechazo(respuesta, 409, "TRIP_FINISHED")


# --- Cambios en el recorrido -------------------------------------------------------


def test_cp8_cambiar_noches_en_viaje_actualiza_la_fecha_de_llegada(
    client, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")
    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )

    _editar(
        client,
        auth_headers,
        id_viaje,
        [_destino("Bariloche", 3, 1), _destino("Mendoza", 3, 0), _destino("Salta", 2, 0)],
    )

    _, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert actividad["Traslado"]["fechaLlegada"] == str(INICIO + timedelta(days=4))


def test_cambiar_noches_mueve_el_traslado_al_dia_de_salida_nuevo(
    client, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")
    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )

    _editar(
        client,
        auth_headers,
        id_viaje,
        [_destino("Bariloche", 4, 0), _destino("Mendoza", 2, 1), _destino("Salta", 2, 0)],
    )

    dia, _ = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert dia["Fecha"] == str(INICIO + timedelta(days=4))


def test_achicar_fechas_mueve_el_regreso_sin_bloquear_ni_eliminarlo(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO, noches=11)
    regreso = _tramo(_detalle(client, auth_headers, id_viaje), "regreso")
    id_actividad = _agendado(
        _agendar(client, auth_headers, id_viaje, regreso, horaSalida="18:00:00")
    )

    _editar(client, auth_headers, id_viaje, RECORRIDO, noches=9)

    dia, _ = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert dia["Fecha"] == str(INICIO + timedelta(days=9))
    assert db_session.get(ActividadItinerario, id_actividad) is not None


def test_correr_las_fechas_mueve_la_ida(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    id_actividad = _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))

    nuevo_inicio = INICIO + timedelta(days=2)
    _editar(client, auth_headers, id_viaje, RECORRIDO, inicio=nuevo_inicio)

    dia, _ = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert dia["Fecha"] == str(nuevo_inicio)


def test_una_actividad_comun_sigue_bloqueando_achicar_fechas(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO, noches=11)
    detalle = _detalle(client, auth_headers, id_viaje)
    ultimo = _dia_de(detalle, INICIO + timedelta(days=11))
    _crear_actividad(db_session, ultimo["IdDiaCronograma"], "Cena", time(20), time(21))

    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}",
        json={"title": "Cuyo", "destinations": RECORRIDO, **_fechas(9)},
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert "actividades cargadas" in respuesta.json()["detail"]


def test_cambiar_el_primer_destino_renombra_la_ida(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    id_actividad = _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))

    _editar(
        client,
        auth_headers,
        id_viaje,
        [_destino("Mendoza", 3, 0), _destino("Bariloche", 3, 1), _destino("Salta", 2, 0)],
    )

    _, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert actividad["Nombre"] == "Avión a Mendoza"
    assert actividad["Traslado"]["validez"] == "valido"


def test_cp9_quitar_el_destino_de_llegada_marca_no_valido_y_ofrece_el_tramo_nuevo(
    client, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")
    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )

    _editar(client, auth_headers, id_viaje, [_destino("Bariloche", 3, 0), _destino("Salta", 2, 0)])

    detalle = _detalle(client, auth_headers, id_viaje)
    dia, actividad = _actividad_en(detalle, id_actividad)
    assert actividad["Traslado"]["validez"] == "no_corresponde"
    assert dia["Fecha"] == str(INICIO + timedelta(days=3))
    nuevo = _tramo(detalle, "entre_destinos", "Salta")
    assert nuevo["estado"] == "pendiente"
    assert nuevo["nombreOrigen"] == "Bariloche"


def test_quitar_el_destino_de_origen_lo_muestra_en_el_primer_dia(
    client, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")
    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )

    _editar(client, auth_headers, id_viaje, [_destino("Mendoza", 3, 1), _destino("Salta", 2, 0)])

    dia, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert actividad["Traslado"]["validez"] == "no_corresponde"
    assert dia["Fecha"] == str(INICIO)


def test_invertir_el_par_lo_marca_no_valido(client, master_data, auth_headers):
    destinos = [_destino("Bariloche", 3, 0), _destino("Mendoza", 3, 0)]
    id_viaje = _crear(client, auth_headers, destinos)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos")
    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )

    _editar(client, auth_headers, id_viaje, [_destino("Mendoza", 3, 0), _destino("Bariloche", 3, 0)])

    detalle = _detalle(client, auth_headers, id_viaje)
    _, actividad = _actividad_en(detalle, id_actividad)
    assert actividad["Traslado"]["validez"] == "no_corresponde"
    assert _tramo(detalle, "entre_destinos", "Bariloche")["estado"] == "pendiente"


def test_recorrido_sin_armar_deja_el_traslado_sin_fecha_y_vuelve_a_su_dia_al_rearmar(
    client, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")
    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )

    _editar(
        client,
        auth_headers,
        id_viaje,
        [
            {**_destino("Bariloche"), "noches": None, "nochesEnViaje": 0},
            {**_destino("Mendoza"), "noches": None, "nochesEnViaje": 0},
            {**_destino("Salta"), "noches": None, "nochesEnViaje": 0},
        ],
    )

    detalle = _detalle(client, auth_headers, id_viaje)
    dia, actividad = _actividad_en(detalle, id_actividad)
    assert actividad["Traslado"]["validez"] == "sin_fecha"
    assert actividad["Traslado"]["fechaSalida"] is None
    assert dia["Fecha"] == str(INICIO)

    _editar(client, auth_headers, id_viaje, RECORRIDO)

    dia, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert actividad["Traslado"]["validez"] == "valido"
    assert dia["Fecha"] == str(INICIO + timedelta(days=3))


def test_quedar_con_un_destino_lo_marca_no_valido(client, master_data, auth_headers):
    destinos = [_destino("Bariloche", 3, 0), _destino("Mendoza", 3, 0)]
    id_viaje = _crear(client, auth_headers, destinos)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos")
    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )

    _editar(client, auth_headers, id_viaje, [_destino("Bariloche")])

    detalle = _detalle(client, auth_headers, id_viaje)
    _, actividad = _actividad_en(detalle, id_actividad)
    assert actividad["Traslado"]["validez"] == "no_corresponde"
    assert [t["tipo"] for t in detalle["traslados"] if t["validez"] == "valido"] == [
        "ida",
        "regreso",
    ]


def test_sacar_la_noche_en_viaje_pide_revisar_el_horario_sin_invalidar(
    client, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Salta")
    id_actividad = _agendado(
        _agendar(
            client,
            auth_headers,
            id_viaje,
            tramo,
            medio="bus",
            horaSalida="22:00:00",
            horaLlegada="08:00:00",
        )
    )

    _editar(
        client,
        auth_headers,
        id_viaje,
        [_destino("Bariloche", 3, 0), _destino("Mendoza", 3, 0), _destino("Salta", 2, 0)],
    )

    _, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert actividad["Traslado"]["validez"] == "valido"
    assert actividad["Traslado"]["revisarHorario"] is True


# --- Editar un traslado no válido --------------------------------------------------


def _traslado_no_valido(client, headers):
    id_viaje = _crear(client, headers, RECORRIDO)
    tramo = _tramo(_detalle(client, headers, id_viaje), "entre_destinos", "Mendoza")
    id_actividad = _agendado(
        _agendar(client, headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00")
    )
    _editar(client, headers, id_viaje, [_destino("Bariloche", 3, 0), _destino("Salta", 2, 0)])
    return id_viaje, id_actividad


def test_no_valido_no_se_guarda_sin_elegir_un_tramo(client, master_data, auth_headers):
    id_viaje, id_actividad = _traslado_no_valido(client, auth_headers)

    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}/traslados/{id_actividad}",
        json={"medio": "plane", "horaSalida": "10:00:00", "horaLlegada": "11:00:00"},
        headers=auth_headers,
    )

    _rechazo(respuesta, 400, "TRANSFER_SEGMENT_REQUIRED")


def test_no_valido_se_reasigna_a_un_tramo_libre(client, master_data, auth_headers):
    id_viaje, id_actividad = _traslado_no_valido(client, auth_headers)
    nuevo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Salta")

    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}/traslados/{id_actividad}",
        json={
            "tramo": _ref(nuevo),
            "medio": "plane",
            "horaSalida": "10:00:00",
            "horaLlegada": "11:00:00",
            "notas": "AR1",
        },
        headers=auth_headers,
    )

    _agendado(respuesta)
    detalle = _detalle(client, auth_headers, id_viaje)
    dia, actividad = _actividad_en(detalle, id_actividad)
    assert actividad["Traslado"]["validez"] == "valido"
    assert actividad["Nombre"] == "Avión a Salta"
    assert dia["Fecha"] == str(INICIO + timedelta(days=3))
    assert _tramo(detalle, "entre_destinos", "Salta")["estado"] == "agendado"


def test_no_valido_se_reasigna_a_un_tramo_con_tarjeta_oculta(client, master_data, auth_headers):
    id_viaje, id_actividad = _traslado_no_valido(client, auth_headers)
    regreso = _tramo(_detalle(client, auth_headers, id_viaje), "regreso")
    client.post(
        f"/api/v1/trips/{id_viaje}/traslados/ocultar",
        json={"tramo": _ref(regreso)},
        headers=auth_headers,
    )

    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}/traslados/{id_actividad}",
        json={"tramo": _ref(regreso), "medio": "plane", "horaSalida": "10:00:00"},
        headers=auth_headers,
    )

    _agendado(respuesta)
    detalle = _detalle(client, auth_headers, id_viaje)
    assert _tramo(detalle, "regreso")["estado"] == "agendado"
    assert _actividad_en(detalle, id_actividad)[1]["Nombre"] == "Avión de regreso"


def test_traslado_valido_no_se_reasigna(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    detalle = _detalle(client, auth_headers, id_viaje)
    id_actividad = _agendado(
        _agendar(client, auth_headers, id_viaje, _tramo(detalle, "ida"), horaLlegada="10:00:00")
    )

    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}/traslados/{id_actividad}",
        json={
            "tramo": _ref(_tramo(detalle, "regreso")),
            "medio": "plane",
            "horaSalida": "10:00:00",
        },
        headers=auth_headers,
    )

    _rechazo(respuesta, 409, "TRANSFER_SEGMENT_NOT_AVAILABLE")


def test_sin_fecha_edita_horas_sin_comparar_llegada_y_salida(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")
    id_actividad = _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )
    _editar(
        client,
        auth_headers,
        id_viaje,
        [
            {**_destino("Bariloche"), "noches": None},
            {**_destino("Mendoza"), "noches": None},
            {**_destino("Salta"), "noches": None},
        ],
    )

    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}/traslados/{id_actividad}",
        json={"medio": "train", "horaSalida": "22:00:00", "horaLlegada": "06:00:00"},
        headers=auth_headers,
    )

    _agendado(respuesta)
    _, actividad = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)
    assert actividad["Nombre"] == "Tren a Mendoza"


# --- Superposición -----------------------------------------------------------------


def test_cp10_avisa_la_superposicion_y_permite_guardar_igual(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    detalle = _detalle(client, auth_headers, id_viaje)
    tramo = _tramo(detalle, "entre_destinos", "Mendoza")
    _crear_actividad(db_session, tramo["idDiaCronograma"], "Museo", time(12), time(14))
    datos = {"horaSalida": "11:40:00", "horaLlegada": "13:35:00"}

    aviso = _agendar(client, auth_headers, id_viaje, tramo, **datos)

    assert aviso.status_code == 200
    cuerpo = aviso.json()
    assert cuerpo["guardado"] is False
    assert cuerpo["requiereConfirmacion"] is True
    assert cuerpo["mensaje"] == "Hay 1 actividad mientras viajan: Museo (12:00)."
    assert _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")[
        "estado"
    ] == "pendiente"

    _agendado(
        _agendar(client, auth_headers, id_viaje, tramo, confirmarSuperposicion=True, **datos)
    )


def test_actividad_que_toca_el_borde_no_se_superpone(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")
    _crear_actividad(db_session, tramo["idDiaCronograma"], "Almuerzo", time(13, 35), time(15))

    _agendado(
        _agendar(
            client, auth_headers, id_viaje, tramo, horaSalida="11:40:00", horaLlegada="13:35:00"
        )
    )


def test_ida_avisa_lo_que_empieza_antes_de_la_llegada(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    dia = ida["idDiaCronograma"]
    _crear_actividad(db_session, dia, "Desayuno", time(9), time(10))
    _crear_actividad(db_session, dia, "Cena", time(21), time(22))

    respuesta = _agendar(client, auth_headers, id_viaje, ida, horaLlegada="13:00:00")

    assert [s["nombre"] for s in respuesta.json()["superpuestas"]] == ["Desayuno"]


def test_regreso_avisa_lo_que_termina_despues_de_la_salida(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    regreso = _tramo(_detalle(client, auth_headers, id_viaje), "regreso")
    dia = regreso["idDiaCronograma"]
    _crear_actividad(db_session, dia, "Desayuno", time(9), time(10))
    _crear_actividad(db_session, dia, "Cena", time(21), time(22))

    respuesta = _agendar(client, auth_headers, id_viaje, regreso, horaSalida="18:00:00")

    assert [s["nombre"] for s in respuesta.json()["superpuestas"]] == ["Cena"]


def test_con_noches_en_viaje_cuenta_salida_y_llegada_pero_no_los_dias_completos(
    client, db_session, master_data, auth_headers
):
    destinos = [_destino("Bariloche", 3, 2), _destino("Mendoza", 3, 0)]
    id_viaje = _crear(client, auth_headers, destinos, noches=8)
    detalle = _detalle(client, auth_headers, id_viaje)
    tramo = _tramo(detalle, "entre_destinos")
    salida = _dia_de(detalle, INICIO + timedelta(days=3))["IdDiaCronograma"]
    en_viaje = _dia_de(detalle, INICIO + timedelta(days=4))["IdDiaCronograma"]
    llegada = _dia_de(detalle, INICIO + timedelta(days=5))["IdDiaCronograma"]
    _crear_actividad(db_session, salida, "Antes de salir", time(9), time(10))
    _crear_actividad(db_session, salida, "Después de salir", time(21), time(23))
    _crear_actividad(db_session, en_viaje, "En viaje", time(12), time(13))
    _crear_actividad(db_session, llegada, "Antes de llegar", time(6), time(7))
    _crear_actividad(db_session, llegada, "Después de llegar", time(12), time(13))

    respuesta = _agendar(
        client, auth_headers, id_viaje, tramo, horaSalida="20:00:00", horaLlegada="08:00:00"
    )

    cuerpo = respuesta.json()
    assert sorted(s["nombre"] for s in cuerpo["superpuestas"]) == [
        "Antes de llegar",
        "Después de salir",
    ]
    assert cuerpo["mensaje"].startswith("Hay 2 actividades mientras viajan: ")


# --- Ocultar y eliminar ------------------------------------------------------------


def test_cp11_ocultar_deja_el_indicador_y_se_puede_agendar_despues(
    client, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")

    respuesta = client.post(
        f"/api/v1/trips/{id_viaje}/traslados/ocultar",
        json={"tramo": _ref(ida)},
        headers=auth_headers,
    )

    assert respuesta.status_code == 200
    assert _tramo(_detalle(client, auth_headers, id_viaje), "ida")["estado"] == "oculto"

    _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))
    assert _tramo(_detalle(client, auth_headers, id_viaje), "ida")["estado"] == "agendado"


def test_ocultar_un_tramo_agendado_falla(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))

    respuesta = client.post(
        f"/api/v1/trips/{id_viaje}/traslados/ocultar",
        json={"tramo": _ref(ida)},
        headers=auth_headers,
    )

    _rechazo(respuesta, 409, "TRANSFER_ALREADY_EXISTS")


def test_oculto_de_un_tramo_que_desaparece_no_queda_guardado(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    tramo = _tramo(_detalle(client, auth_headers, id_viaje), "entre_destinos", "Mendoza")
    client.post(
        f"/api/v1/trips/{id_viaje}/traslados/ocultar",
        json={"tramo": _ref(tramo)},
        headers=auth_headers,
    )

    _editar(client, auth_headers, id_viaje, [_destino("Bariloche", 3, 0), _destino("Salta", 2, 0)])

    assert db_session.query(TramoTrasladoViaje).filter_by(IdViaje=id_viaje).count() == 0


def test_cp12_eliminar_vuelve_a_mostrar_la_tarjeta(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    client.post(
        f"/api/v1/trips/{id_viaje}/traslados/ocultar",
        json={"tramo": _ref(ida)},
        headers=auth_headers,
    )
    id_actividad = _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))

    respuesta = client.delete(
        f"/api/v1/trips/{id_viaje}/days/{ida['idDiaCronograma']}/activities/{id_actividad}",
        headers=auth_headers,
    )

    assert respuesta.status_code == 200
    assert _tramo(_detalle(client, auth_headers, id_viaje), "ida")["estado"] == "pendiente"
    assert db_session.query(TramoTrasladoViaje).filter_by(IdViaje=id_viaje).count() == 0


def test_eliminar_un_no_valido_lo_saca_del_itinerario(client, master_data, auth_headers):
    id_viaje, id_actividad = _traslado_no_valido(client, auth_headers)
    dia, _ = _actividad_en(_detalle(client, auth_headers, id_viaje), id_actividad)

    client.delete(
        f"/api/v1/trips/{id_viaje}/days/{dia['IdDiaCronograma']}/activities/{id_actividad}",
        headers=auth_headers,
    )

    detalle = _detalle(client, auth_headers, id_viaje)
    assert all(t["validez"] == "valido" for t in detalle["traslados"])


# --- Relación con el resto de las actividades --------------------------------------


def test_cp14_agendar_y_ocultar_se_emiten_en_tiempo_real(
    client, master_data, auth_headers, _broadcast
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    detalle = _detalle(client, auth_headers, id_viaje)

    id_actividad = _agendado(
        _agendar(client, auth_headers, id_viaje, _tramo(detalle, "ida"), horaLlegada="10:00:00")
    )
    client.put(
        f"/api/v1/trips/{id_viaje}/traslados/{id_actividad}",
        json={"medio": "bus", "horaLlegada": "11:00:00"},
        headers=auth_headers,
    )
    client.post(
        f"/api/v1/trips/{id_viaje}/traslados/ocultar",
        json={"tramo": _ref(_tramo(detalle, "regreso"))},
        headers=auth_headers,
    )

    tipos = [llamada.args[1]["tipo"] for llamada in _broadcast.await_args_list]
    assert tipos == ["actividad_creada", "actividad_actualizada", "traslados_actualizados"]


def test_no_analiza_horarios_ni_entradas(client, master_data, auth_headers, monkeypatch):
    analisis = AsyncMock()
    entradas = AsyncMock()
    monkeypatch.setattr(trips_module, "analizar_horario_actividad", analisis)
    monkeypatch.setattr(trips_module, "evaluar_entradas", entradas)
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    detalle = _detalle(client, auth_headers, id_viaje)

    id_actividad = _agendado(
        _agendar(client, auth_headers, id_viaje, _tramo(detalle, "ida"), horaLlegada="10:00:00")
    )
    client.put(
        f"/api/v1/trips/{id_viaje}/traslados/{id_actividad}",
        json={"medio": "bus", "horaLlegada": "11:00:00"},
        headers=auth_headers,
    )

    analisis.assert_not_awaited()
    entradas.assert_not_awaited()
    assert not hasattr(rutas_traslados, "analizar_horario_actividad")


def test_el_put_generico_no_edita_traslados(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    id_actividad = _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))

    respuesta = client.put(
        f"/api/v1/trips/{id_viaje}/days/{ida['idDiaCronograma']}/activities/{id_actividad}",
        json={"nombre": "Otro", "horaInicio": "10:00:00", "horaFin": "11:00:00"},
        headers=auth_headers,
    )

    _rechazo(respuesta, 409, "TRANSFER_USE_TRANSFER_FORM")


def test_la_ruta_del_dia_ignora_los_traslados(client, db_session, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))
    _crear_actividad(db_session, ida["idDiaCronograma"], "Museo", time(12), time(13))
    dia = db_session.get(DiaCronograma, ida["idDiaCronograma"])
    db_session.refresh(dia)

    con_lugar, sin_lugar = route_generation._actividades_con_y_sin_ubicacion(dia.Actividades)

    assert con_lugar == []
    assert [a.Nombre for a in sin_lugar] == ["Museo"]


def test_recordatorios_excluyen_la_ida_pero_no_el_regreso(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, [_destino("Mendoza")], noches=0)
    detalle = _detalle(client, auth_headers, id_viaje)
    _agendado(
        _agendar(client, auth_headers, id_viaje, _tramo(detalle, "ida"), horaLlegada="10:00:00")
    )
    _agendado(
        _agendar(client, auth_headers, id_viaje, _tramo(detalle, "regreso"), horaSalida="18:00:00")
    )
    _crear_actividad(
        db_session, _tramo(detalle, "ida")["idDiaCronograma"], "Museo", time(12), time(13)
    )
    ahora = datetime.combine(INICIO, time(0))

    candidatas = _load_candidate_activities(db_session, ahora, ahora + timedelta(hours=23))

    assert sorted(a.Nombre for a in candidatas) == ["Avión de regreso", "Museo"]


# --- Días libres (US 92) y helpers -------------------------------------------------


def test_ocupacion_y_dias_en_viaje(client, db_session, master_data, auth_headers):
    destinos = [_destino("Bariloche", 3, 2), _destino("Mendoza", 3, 0)]
    id_viaje = _crear(client, auth_headers, destinos, noches=8)
    detalle = _detalle(client, auth_headers, id_viaje)
    _agendado(
        _agendar(
            client,
            auth_headers,
            id_viaje,
            _tramo(detalle, "entre_destinos"),
            horaSalida="20:00:00",
            horaLlegada="08:00:00",
        )
    )
    _agendado(
        _agendar(client, auth_headers, id_viaje, _tramo(detalle, "ida"), horaLlegada="13:00:00")
    )
    _agendado(
        _agendar(client, auth_headers, id_viaje, _tramo(detalle, "regreso"), horaSalida="15:00:00")
    )
    viaje = db_session.get(Viaje, id_viaje)
    db_session.refresh(viaje)
    id_dia = {d.Fecha: d.IdDiaCronograma for d in viaje.Cronograma}

    ocupados = ocupacion_traslados(viaje)

    assert ocupados[id_dia[INICIO]] == [(0, 13 * 60)]
    assert ocupados[id_dia[INICIO + timedelta(days=3)]] == [(20 * 60, 1439)]
    assert ocupados[id_dia[INICIO + timedelta(days=5)]] == [(0, 8 * 60)]
    assert ocupados[id_dia[INICIO + timedelta(days=8)]] == [(15 * 60, 1439)]
    assert dias_en_viaje(viaje) == {id_dia[INICIO + timedelta(days=4)]}


@pytest.mark.parametrize(
    ("tipo", "inicio", "fin", "esperado"),
    [
        (TIPO_TRAMO_IDA, time(13), time(13), (0, 13 * 60)),
        (TIPO_TRAMO_REGRESO, time(18), time(18), (18 * 60, 1439)),
        (TIPO_TRAMO_ENTRE_DESTINOS, time(11), time(13), (11 * 60, 13 * 60)),
        (TIPO_TRAMO_ENTRE_DESTINOS, time(22), time(8), (22 * 60, 1439)),
        (None, time(9), time(10), (9 * 60, 10 * 60)),
    ],
)
def test_intervalo_actividad(tipo, inicio, fin, esperado):
    tramo = SimpleNamespace(IdTipoTramoTraslado=tipo) if tipo else None
    actividad = SimpleNamespace(HoraInicio=inicio, HoraFin=fin, TramoTraslado=tramo)

    assert intervalo_actividad(actividad) == esperado


def test_calcular_tramos_coincide_con_la_cuenta_de_la_app():
    destinos = [
        SimpleNamespace(Noches=2, NochesEnViaje=0),
        SimpleNamespace(Noches=3, NochesEnViaje=1),
        SimpleNamespace(Noches=2, NochesEnViaje=0),
    ]
    inicio = date(2026, 12, 1)

    tramos = calcular_tramos(destinos, inicio)

    assert [(t.llegada.day, t.salida.day, t.llegada_siguiente.day) for t in tramos] == [
        (1, 3, 3),
        (3, 6, 7),
        (7, 9, 9),
    ]


def test_destino_del_catalogo_conserva_el_nombre_del_traslado_no_valido(
    client, db_session, master_data, auth_headers
):
    id_viaje, id_actividad = _traslado_no_valido(client, auth_headers)

    detalle = _detalle(client, auth_headers, id_viaje)
    _, actividad = _actividad_en(detalle, id_actividad)

    assert actividad["Traslado"]["nombreLlegada"] == "Mendoza"
    assert db_session.query(Destino).filter_by(Nombre="Mendoza").count() == 1


# --- Volver a mostrar --------------------------------------------------------------


def _ocultar(client, headers, id_viaje, tramo, oculto=True):
    return client.post(
        f"/api/v1/trips/{id_viaje}/traslados/ocultar",
        json={"tramo": _ref(tramo), "oculto": oculto},
        headers=headers,
    )


def test_mostrar_vuelve_a_la_tarjeta_y_no_deja_la_fila(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    assert _ocultar(client, auth_headers, id_viaje, ida).status_code == 200

    respuesta = _ocultar(client, auth_headers, id_viaje, ida, oculto=False)

    assert respuesta.status_code == 200
    assert _tramo(_detalle(client, auth_headers, id_viaje), "ida")["estado"] == "pendiente"
    assert db_session.query(TramoTrasladoViaje).filter_by(IdViaje=id_viaje).count() == 0


def test_mostrar_un_tramo_que_no_estaba_oculto_no_cambia_nada(
    client, db_session, master_data, auth_headers
):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")

    respuesta = _ocultar(client, auth_headers, id_viaje, ida, oculto=False)

    assert respuesta.status_code == 200
    assert _tramo(_detalle(client, auth_headers, id_viaje), "ida")["estado"] == "pendiente"
    assert db_session.query(TramoTrasladoViaje).filter_by(IdViaje=id_viaje).count() == 0


def test_cualquier_participante_puede_mostrar(client, db_session, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    _ocultar(client, auth_headers, id_viaje, ida)
    headers = _participante(db_session, id_viaje)

    assert _ocultar(client, headers, id_viaje, ida, oculto=False).status_code == 200


def test_invitado_sin_aceptar_no_puede_mostrar(client, db_session, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    _ocultar(client, auth_headers, id_viaje, ida)
    headers = _participante(db_session, id_viaje, estado="invitado")

    assert _ocultar(client, headers, id_viaje, ida, oculto=False).status_code == 403


def test_mostrar_se_emite_en_tiempo_real(client, master_data, auth_headers, _broadcast):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    _ocultar(client, auth_headers, id_viaje, ida)
    _broadcast.reset_mock()

    _ocultar(client, auth_headers, id_viaje, ida, oculto=False)

    assert [llamada.args[1]["tipo"] for llamada in _broadcast.await_args_list] == [
        "traslados_actualizados"
    ]


def test_mostrar_un_tramo_agendado_falla(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))

    _rechazo(
        _ocultar(client, auth_headers, id_viaje, ida, oculto=False),
        409,
        "TRANSFER_ALREADY_EXISTS",
    )


def test_agendar_desde_oculto_deja_de_estar_oculto(client, db_session, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, RECORRIDO)
    ida = _tramo(_detalle(client, auth_headers, id_viaje), "ida")
    _ocultar(client, auth_headers, id_viaje, ida)

    _agendado(_agendar(client, auth_headers, id_viaje, ida, horaLlegada="10:00:00"))

    fila = db_session.query(TramoTrasladoViaje).filter_by(IdViaje=id_viaje).one()
    assert fila.Oculto is False

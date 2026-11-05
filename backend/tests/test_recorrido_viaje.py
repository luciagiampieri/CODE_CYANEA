"""US A: armar el recorrido del viaje (orden, noches y noches en viaje)."""

from datetime import date, timedelta
from unittest.mock import AsyncMock

import pytest

from app.api.routes import trips as trips_module
from app.core.security import create_access_token, hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario


@pytest.fixture(autouse=True)
def _sin_servicios_externos(monkeypatch):
    monkeypatch.setattr(trips_module.manager, "broadcast_to_trip", AsyncMock())


def _destino(nombre, noches=None, en_viaje=None, **extra):
    datos = {"name": nombre, "country": "Argentina", "placeId": f"place-{nombre}", **extra}
    if noches is not None:
        datos["noches"] = noches
    if en_viaje is not None:
        datos["nochesEnViaje"] = en_viaje
    return datos


def _fechas(noches=9):
    inicio = date.today() + timedelta(days=30)
    return {"startDate": str(inicio), "endDate": str(inicio + timedelta(days=noches))}


def _payload_alta(destinos, noches=9):
    return {
        "title": "Norte argentino",
        "currency": "ARS",
        "destinations": destinos,
        "participantUserIds": [],
        "invitedEmails": [],
        **_fechas(noches),
    }


def _payload_edicion(destinos, noches=9):
    return {"title": "Norte argentino", "destinations": destinos, **_fechas(noches)}


def _crear(client, headers, destinos, noches=9):
    respuesta = client.post("/api/v1/trips", json=_payload_alta(destinos, noches), headers=headers)
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()["id"]


def _editar(client, headers, id_viaje, destinos, noches=9):
    return client.put(
        f"/api/v1/trips/{id_viaje}", json=_payload_edicion(destinos, noches), headers=headers
    )


def _recorrido(client, headers, id_viaje):
    respuesta = client.get(f"/api/v1/trips/{id_viaje}", headers=headers)
    assert respuesta.status_code == 200, respuesta.text
    return [
        (d["name"], d["orden"], d["noches"], d["nochesEnViaje"])
        for d in respuesta.json()["destinations"]
    ]


def _assert_rechazo(respuesta, codigo):
    assert respuesta.status_code == 400, respuesta.text
    assert respuesta.headers["X-Error-Code"] == codigo


# --- Crear ------------------------------------------------------------------


def test_viaje_de_un_destino_no_guarda_noches(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, [_destino("Salta", noches=4, en_viaje=2)])

    assert _recorrido(client, auth_headers, id_viaje) == [("Salta", 0, None, 0)]


def test_crea_tres_destinos_con_orden_y_noches(client, master_data, auth_headers):
    id_viaje = _crear(
        client,
        auth_headers,
        [_destino("Mendoza", 3, 0), _destino("Salta", 3, 0), _destino("Cafayate", 3, 0)],
    )

    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, 3, 0),
        ("Salta", 1, 3, 0),
        ("Cafayate", 2, 3, 0),
    ]


def test_guarda_noches_en_viaje_hacia_el_destino_siguiente(client, master_data, auth_headers):
    id_viaje = _crear(
        client, auth_headers, [_destino("Mendoza", 4, 1), _destino("Salta", 4, 0)]
    )

    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, 4, 1),
        ("Salta", 1, 4, 0),
    ]


def test_acepta_noches_libres(client, master_data, auth_headers):
    id_viaje = _crear(
        client, auth_headers, [_destino("Mendoza", 4, 0), _destino("Salta", 3, 0)]
    )

    assert [fila[2] for fila in _recorrido(client, auth_headers, id_viaje)] == [4, 3]


@pytest.mark.parametrize(
    "destinos, codigo",
    [
        ([_destino("Mendoza", 9, 0), _destino("Salta", 0, 0)], "ROUTE_DESTINATION_WITHOUT_NIGHTS"),
        ([_destino("Mendoza", 5, 0), _destino("Salta", 5, 0)], "ROUTE_NIGHTS_EXCEEDED"),
        ([_destino("Mendoza", 4, 2), _destino("Salta", 4, 0)], "ROUTE_NIGHTS_EXCEEDED"),
        ([_destino("Mendoza", -1, 0), _destino("Salta", 3, 0)], "ROUTE_INVALID_NIGHTS"),
        ([_destino("Mendoza", 3, -1), _destino("Salta", 3, 0)], "ROUTE_INVALID_NIGHTS"),
        ([_destino("Mendoza", 3, 0), _destino("Salta")], "ROUTE_INCOMPLETE"),
        ([_destino("Mendoza", 3, 0), _destino("Salta", 3, 1)], "ROUTE_INVALID_TRANSFER"),
    ],
)
def test_rechaza_recorridos_invalidos_al_crear(client, master_data, auth_headers, destinos, codigo):
    respuesta = client.post("/api/v1/trips", json=_payload_alta(destinos), headers=auth_headers)

    _assert_rechazo(respuesta, codigo)


def test_viaje_con_menos_noches_que_destinos_se_guarda_sin_recorrido(
    client, master_data, auth_headers
):
    destinos = [
        {**_destino("Mendoza"), "noches": None, "nochesEnViaje": 0},
        {**_destino("Salta"), "noches": None, "nochesEnViaje": 0},
        {**_destino("Cafayate"), "noches": None, "nochesEnViaje": 0},
    ]

    id_viaje = _crear(client, auth_headers, destinos, noches=2)

    assert [fila[2] for fila in _recorrido(client, auth_headers, id_viaje)] == [None, None, None]


def test_alta_de_app_anterior_sin_noches_queda_sin_recorrido(client, master_data, auth_headers):
    id_viaje = _crear(client, auth_headers, [_destino("Mendoza"), _destino("Salta")])

    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, None, 0),
        ("Salta", 1, None, 0),
    ]


# --- Editar -----------------------------------------------------------------


def test_edicion_actualiza_orden_y_noches_de_destinos_existentes(
    client, master_data, auth_headers
):
    id_viaje = _crear(
        client, auth_headers, [_destino("Mendoza", 3, 0), _destino("Salta", 3, 0)]
    )

    respuesta = _editar(
        client, auth_headers, id_viaje, [_destino("Salta", 5, 1), _destino("Mendoza", 2, 0)]
    )

    assert respuesta.status_code == 200, respuesta.text
    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Salta", 0, 5, 1),
        ("Mendoza", 1, 2, 0),
    ]


def test_edicion_invalida_no_cambia_nada(client, master_data, auth_headers):
    id_viaje = _crear(
        client, auth_headers, [_destino("Mendoza", 3, 0), _destino("Salta", 3, 0)]
    )

    respuesta = _editar(
        client, auth_headers, id_viaje, [_destino("Salta", 8, 0), _destino("Mendoza", 2, 0)]
    )

    _assert_rechazo(respuesta, "ROUTE_NIGHTS_EXCEEDED")
    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, 3, 0),
        ("Salta", 1, 3, 0),
    ]


def test_quitar_un_destino_lo_saca_del_recorrido(client, master_data, auth_headers):
    id_viaje = _crear(
        client,
        auth_headers,
        [_destino("Mendoza", 3, 0), _destino("Salta", 3, 0), _destino("Cafayate", 3, 0)],
    )

    respuesta = _editar(
        client, auth_headers, id_viaje, [_destino("Mendoza", 3, 0), _destino("Cafayate", 3, 0)]
    )

    assert respuesta.status_code == 200, respuesta.text
    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, 3, 0),
        ("Cafayate", 1, 3, 0),
    ]


def test_extender_las_fechas_deja_noches_libres_y_guarda(client, master_data, auth_headers):
    destinos = [_destino("Mendoza", 4, 0), _destino("Salta", 5, 0)]
    id_viaje = _crear(client, auth_headers, destinos)

    respuesta = _editar(client, auth_headers, id_viaje, destinos, noches=12)

    assert respuesta.status_code == 200, respuesta.text


def test_acortar_las_fechas_con_noches_de_mas_no_guarda(client, master_data, auth_headers):
    destinos = [_destino("Mendoza", 4, 0), _destino("Salta", 5, 0)]
    id_viaje = _crear(client, auth_headers, destinos)

    respuesta = _editar(client, auth_headers, id_viaje, destinos, noches=7)

    _assert_rechazo(respuesta, "ROUTE_NIGHTS_EXCEEDED")


def test_null_explicito_borra_el_recorrido(client, master_data, auth_headers):
    id_viaje = _crear(
        client, auth_headers, [_destino("Mendoza", 4, 1), _destino("Salta", 4, 0)]
    )
    sin_recorrido = [
        {**_destino("Mendoza"), "noches": None, "nochesEnViaje": 0},
        {**_destino("Salta"), "noches": None, "nochesEnViaje": 0},
    ]

    respuesta = _editar(client, auth_headers, id_viaje, sin_recorrido, noches=1)

    assert respuesta.status_code == 200, respuesta.text
    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, None, 0),
        ("Salta", 1, None, 0),
    ]


def test_participante_no_administrador_no_puede_editar_el_recorrido(
    client, db_session, master_data, auth_headers
):
    destinos = [_destino("Mendoza", 3, 0), _destino("Salta", 3, 0)]
    id_viaje = _crear(client, auth_headers, destinos)

    participante = Usuario(
        Nombre="Part",
        Apellido="Test",
        NombreUsuario="participante_recorrido",
        Email="participante_recorrido@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(participante)
    db_session.commit()
    db_session.add(
        ParticipanteViaje(
            IdViaje=id_viaje,
            IdUsuario=participante.IdUsuario,
            IdRolParticipante=db_session.query(RolParticipante)
            .filter_by(Nombre="participante")
            .first()
            .IdRolParticipante,
            IdEstadoParticipacion=db_session.query(EstadoParticipacion)
            .filter_by(Nombre="aceptado")
            .first()
            .IdEstadoParticipacion,
        )
    )
    db_session.commit()
    token = create_access_token(
        {"sub": participante.Email, "user_id": participante.IdUsuario}
    )

    respuesta = _editar(
        client,
        {"Authorization": f"Bearer {token}"},
        id_viaje,
        [_destino("Salta", 5, 0), _destino("Mendoza", 2, 0)],
    )

    assert respuesta.status_code == 403
    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, 3, 0),
        ("Salta", 1, 3, 0),
    ]


# --- Versiones anteriores de la app (no envían los campos) -------------------


def test_app_anterior_conserva_el_recorrido_guardado(client, master_data, auth_headers):
    id_viaje = _crear(
        client, auth_headers, [_destino("Mendoza", 4, 1), _destino("Salta", 4, 0)]
    )

    respuesta = _editar(
        client, auth_headers, id_viaje, [_destino("Mendoza"), _destino("Salta")]
    )

    assert respuesta.status_code == 200, respuesta.text
    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, 4, 1),
        ("Salta", 1, 4, 0),
    ]


def test_app_anterior_agrega_un_destino_que_queda_sin_noches(client, master_data, auth_headers):
    id_viaje = _crear(
        client, auth_headers, [_destino("Mendoza", 3, 0), _destino("Salta", 3, 0)]
    )

    respuesta = _editar(
        client,
        auth_headers,
        id_viaje,
        [_destino("Mendoza"), _destino("Salta"), _destino("Cafayate")],
    )

    assert respuesta.status_code == 200, respuesta.text
    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, 3, 0),
        ("Salta", 1, 3, 0),
        ("Cafayate", 2, None, 0),
    ]


def test_app_anterior_que_acorta_las_fechas_deja_el_recorrido_sin_armar(
    client, master_data, auth_headers
):
    id_viaje = _crear(
        client, auth_headers, [_destino("Mendoza", 4, 1), _destino("Salta", 4, 0)]
    )

    respuesta = _editar(
        client, auth_headers, id_viaje, [_destino("Mendoza"), _destino("Salta")], noches=5
    )

    assert respuesta.status_code == 200, respuesta.text
    assert _recorrido(client, auth_headers, id_viaje) == [
        ("Mendoza", 0, None, 0),
        ("Salta", 1, None, 0),
    ]

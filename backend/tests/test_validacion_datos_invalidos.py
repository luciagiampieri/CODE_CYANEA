"""Datos inválidos que respondían 500 en lugar de 422 (QA).

- Registro con nombre, apellido o nombre de usuario más largos que su columna.
- Alta de viaje sin fecha de inicio o de fin.
- Alta de viaje con una moneda que no existe.
- Campos de destino más largos que su columna o coordenadas fuera de rango.
"""

from datetime import date, timedelta

import pytest

from app.models.usuario import Usuario
from app.models.viaje import Viaje

URL_REGISTRO = "/api/v1/auth/register"
URL_VIAJES = "/api/v1/trips"


def _registro(**cambios) -> dict:
    datos = {
        "nombre": "Juan",
        "apellido": "Perez",
        "nombreUsuario": "juanp",
        "email": "juan@test.com",
        "password": "Password123!",
        "aceptaTerminos": True,
    }
    datos.update(cambios)
    return datos


def _viaje(**cambios) -> dict:
    inicio = date.today() + timedelta(days=10)
    datos = {
        "title": "Escapada",
        "destinations": [{"name": "Córdoba", "country": "Argentina"}],
        "startDate": inicio.isoformat(),
        "endDate": (inicio + timedelta(days=3)).isoformat(),
        "currency": "ARS",
    }
    datos.update(cambios)
    return datos


def _mensajes(response) -> str:
    detalle = response.json()["detail"]
    if isinstance(detalle, str):
        return detalle
    return " ".join(str(error.get("msg")) for error in detalle)


@pytest.mark.parametrize(
    ("campo", "maximo", "etiqueta"),
    [("nombre", 100, "El nombre"), ("apellido", 100, "El apellido"), ("nombreUsuario", 50, "El nombre de usuario")],
)
def test_registro_con_campo_demasiado_largo_responde_422(client, db_session, campo, maximo, etiqueta):
    response = client.post(URL_REGISTRO, json=_registro(**{campo: "a" * (maximo + 1)}))

    assert response.status_code == 422
    assert f"{etiqueta} no puede superar los {maximo} caracteres" in _mensajes(response)
    assert db_session.query(Usuario).count() == 0


def test_registro_con_nombre_de_5000_caracteres_responde_422(client):
    response = client.post(URL_REGISTRO, json=_registro(nombre="a" * 5000))

    assert response.status_code == 422


def test_registro_con_campos_en_el_limite_se_acepta(client):
    response = client.post(
        URL_REGISTRO,
        json=_registro(nombre="a" * 100, apellido="b" * 100, nombreUsuario="c" * 50),
    )

    assert response.status_code == 201


def test_editar_perfil_con_nombre_demasiado_largo_responde_422(client, auth_headers):
    response = client.put(
        "/api/v1/users/me",
        json={"nombre": "a" * 101, "apellido": "Test", "nombreUsuario": "ana_test"},
        headers=auth_headers,
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("campo", "mensaje"),
    [("startDate", "La fecha de inicio es obligatoria"), ("endDate", "La fecha de fin es obligatoria")],
)
def test_crear_viaje_sin_fecha_responde_422(client, db_session, master_data, auth_headers, campo, mensaje):
    datos = _viaje()
    del datos[campo]

    response = client.post(URL_VIAJES, json=datos, headers=auth_headers)

    assert response.status_code == 422
    assert mensaje in _mensajes(response)
    assert db_session.query(Viaje).count() == 0


def test_crear_viaje_con_fecha_nula_responde_422(client, master_data, auth_headers):
    response = client.post(URL_VIAJES, json=_viaje(endDate=None), headers=auth_headers)

    assert response.status_code == 422


def test_crear_viaje_con_moneda_inexistente_responde_422(client, db_session, master_data, auth_headers):
    response = client.post(URL_VIAJES, json=_viaje(currency="ZZZ"), headers=auth_headers)

    assert response.status_code == 422
    assert "La moneda ZZZ no está soportada." in _mensajes(response)
    assert db_session.query(Viaje).count() == 0


def test_crear_viaje_con_moneda_mal_formada_responde_422(client, master_data, auth_headers):
    response = client.post(URL_VIAJES, json=_viaje(currency="A1$"), headers=auth_headers)

    assert response.status_code == 422


def test_crear_viaje_acepta_la_moneda_en_minusculas(client, master_data, auth_headers):
    response = client.post(URL_VIAJES, json=_viaje(currency="usd"), headers=auth_headers)

    assert response.status_code == 201
    assert response.json()["currency"] == "USD"


@pytest.mark.parametrize(
    "destino",
    [
        {"name": "a" * 201, "country": "Argentina"},
        {"name": "Córdoba", "country": "a" * 101},
        {"name": "Córdoba", "country": "Argentina", "provinceState": "a" * 151},
        {"name": "Córdoba", "country": "Argentina", "placeId": "a" * 256},
        {"name": "Córdoba", "country": "Argentina", "lat": 91},
        {"name": "Córdoba", "country": "Argentina", "lng": -181},
    ],
)
def test_crear_viaje_con_destino_invalido_responde_422(client, db_session, master_data, auth_headers, destino):
    response = client.post(URL_VIAJES, json=_viaje(destinations=[destino]), headers=auth_headers)

    assert response.status_code == 422
    assert db_session.query(Viaje).count() == 0


def test_crear_viaje_con_titulo_demasiado_largo_responde_422(client, master_data, auth_headers):
    response = client.post(URL_VIAJES, json=_viaje(title="a" * 151), headers=auth_headers)

    assert response.status_code == 422

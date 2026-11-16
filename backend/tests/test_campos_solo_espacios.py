"""Campos con solo espacios (QA): el registro y el título del viaje los aceptaban."""

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
    return " ".join(str(error.get("msg")) for error in response.json()["detail"])


@pytest.mark.parametrize(
    ("campo", "mensaje"),
    [
        ("nombre", "El nombre no puede estar vacío"),
        ("apellido", "El apellido no puede estar vacío"),
        ("nombreUsuario", "El nombre de usuario no puede estar vacío"),
    ],
)
def test_registro_con_campo_de_solo_espacios_responde_422(client, db_session, campo, mensaje):
    response = client.post(URL_REGISTRO, json=_registro(**{campo: "   "}))

    assert response.status_code == 422
    assert mensaje in _mensajes(response)
    assert db_session.query(Usuario).count() == 0


def test_registro_guarda_los_campos_sin_espacios_alrededor(client, db_session):
    response = client.post(
        URL_REGISTRO, json=_registro(nombre="  Juan ", apellido=" Perez  ", nombreUsuario=" juanp ")
    )

    assert response.status_code == 201
    usuario = db_session.query(Usuario).filter_by(Email="juan@test.com").one()
    assert (usuario.Nombre, usuario.Apellido, usuario.NombreUsuario) == ("Juan", "Perez", "juanp")


def test_crear_viaje_con_titulo_de_solo_espacios_responde_422(client, db_session, master_data, auth_headers):
    response = client.post(URL_VIAJES, json=_viaje(title="   "), headers=auth_headers)

    assert response.status_code == 422
    assert "El nombre del viaje no puede quedar vacío" in _mensajes(response)
    assert db_session.query(Viaje).count() == 0


def test_crear_viaje_guarda_el_titulo_sin_espacios_alrededor(client, master_data, auth_headers):
    response = client.post(URL_VIAJES, json=_viaje(title="  Escapada  "), headers=auth_headers)

    assert response.status_code == 201
    assert response.json()["title"] == "Escapada"


def test_editar_viaje_con_titulo_de_solo_espacios_responde_422(client, db_session, master_data, auth_headers):
    creado = client.post(URL_VIAJES, json=_viaje(), headers=auth_headers)
    assert creado.status_code == 201
    id_viaje = creado.json()["id"]
    datos = _viaje(title="   ")
    del datos["currency"]

    response = client.put(f"{URL_VIAJES}/{id_viaje}", json=datos, headers=auth_headers)

    assert response.status_code == 422
    assert "El nombre del viaje no puede quedar vacío" in _mensajes(response)
    db_session.expire_all()
    assert db_session.get(Viaje, id_viaje).Titulo == "Escapada"

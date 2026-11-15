"""Nombre de usuario sin distinguir mayúsculas (QA): "u123" y "U123" podían coexistir."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.models.usuario import Usuario

URL_REGISTRO = "/api/v1/auth/register"


def _registro(nombre_usuario: str, email: str) -> dict:
    return {
        "nombre": "Juan",
        "apellido": "Perez",
        "nombreUsuario": nombre_usuario,
        "email": email,
        "password": "Password123!",
        "aceptaTerminos": True,
    }


def test_registro_rechaza_el_mismo_nombre_con_otras_mayusculas(client, db_session):
    assert client.post(URL_REGISTRO, json=_registro("u123", "a@test.com")).status_code == 201

    response = client.post(URL_REGISTRO, json=_registro("U123", "b@test.com"))

    assert response.status_code == 409
    assert response.json()["detail"] == "El nombre de usuario ya está en uso."
    assert db_session.query(Usuario).count() == 1


def test_editar_perfil_rechaza_el_mismo_nombre_con_otras_mayusculas(client, auth_headers, db_session):
    db_session.add(
        Usuario(
            Nombre="Otro",
            Apellido="Usuario",
            NombreUsuario="Viajero",
            Email="otro@test.com",
            HashedPassword=hash_password("Password123!"),
            Activo=True,
            EmailConfirmado=True,
        )
    )
    db_session.commit()

    response = client.put(
        "/api/v1/users/me",
        json={"nombre": "Ana", "apellido": "Test", "nombreUsuario": "VIAJERO"},
        headers=auth_headers,
    )

    assert response.status_code == 409


def test_la_base_no_admite_el_mismo_nombre_con_otras_mayusculas(db_session):
    for nombre, email in (("viajero", "a@test.com"), ("VIAJERO", "b@test.com")):
        db_session.add(
            Usuario(
                Nombre="X",
                Apellido="Y",
                NombreUsuario=nombre,
                Email=email,
                HashedPassword="hash",
                Activo=True,
                EmailConfirmado=True,
            )
        )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_registro_simultaneo_que_choca_con_el_indice_responde_409(client, db_session, monkeypatch):
    # Simula que otro registro guardó "U123" entre el control y el commit.
    from app.api.routes import auth

    assert client.post(URL_REGISTRO, json=_registro("u123", "a@test.com")).status_code == 201
    original = auth.select

    def select_que_no_encuentra(*args, **kwargs):
        consulta = original(*args, **kwargs)
        return consulta.where(Usuario.IdUsuario == -1)

    monkeypatch.setattr(auth, "select", select_que_no_encuentra)

    response = client.post(URL_REGISTRO, json=_registro("U123", "b@test.com"))

    assert response.status_code == 409
    assert db_session.query(Usuario).count() == 1

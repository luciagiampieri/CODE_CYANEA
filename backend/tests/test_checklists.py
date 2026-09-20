from unittest.mock import AsyncMock

import pytest

from app.api.routes import checklists as checklists_module
from app.core.security import create_access_token, hash_password
from app.models.categorias_checklist import CategoriasChecklist
from app.models.checklist import Checklist
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario


@pytest.fixture(autouse=True)
def mock_checklist_broadcast(monkeypatch):
    broadcast = AsyncMock()
    monkeypatch.setattr(checklists_module.manager, "broadcast_to_trip", broadcast)
    return broadcast


@pytest.fixture
def categoria_checklist(db_session):
    categoria = CategoriasChecklist(Nombre="Documentacion", Activo=True)
    db_session.add(categoria)
    db_session.commit()
    db_session.refresh(categoria)
    return categoria


@pytest.fixture
def categoria_checklist_inactiva(db_session):
    categoria = CategoriasChecklist(Nombre="Obsoleta", Activo=False)
    db_session.add(categoria)
    db_session.commit()
    db_session.refresh(categoria)
    return categoria


def _headers(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _crear_usuario(db_session, nombre_usuario):
    usuario = Usuario(
        Nombre=nombre_usuario.capitalize(),
        Apellido="Test",
        NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _agregar_participante(db_session, viaje, usuario, estado="aceptado"):
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_participacion = db_session.query(EstadoParticipacion).filter_by(Nombre=estado).first()
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado_participacion.IdEstadoParticipacion,
    )
    db_session.add(participacion)
    db_session.commit()
    return participacion


def _crear_checklist(client, viaje, usuario, categoria, nombre="Pasaporte", responsables=None):
    return client.post(
        f"/api/v1/trips/{viaje.IdViaje}/checklists",
        json={
            "Nombre": nombre,
            "IdCategoriaChecklist": categoria.IdCategoriaChecklist,
            "IdsResponsables": responsables or [],
        },
        headers=_headers(usuario),
    )


def test_listar_categorias_solo_devuelve_categorias_activas(client, db_session, master_data, categoria_checklist, categoria_checklist_inactiva):
    response = client.get("/api/v1/trips/checklists/categorias")

    assert response.status_code == 200
    assert [item["IdCategoriaChecklist"] for item in response.json()] == [categoria_checklist.IdCategoriaChecklist]


def test_crear_checklist_persiste_responsables_y_notifica(client, db_session, viaje_con_admin, categoria_checklist, mock_checklist_broadcast):
    viaje, creador_participacion = viaje_con_admin
    responsable = _crear_usuario(db_session, "responsable")
    _agregar_participante(db_session, viaje, responsable)

    response = _crear_checklist(
        client,
        viaje,
        db_session.get(Usuario, creador_participacion.IdUsuario),
        categoria_checklist,
        responsables=[responsable.IdUsuario],
    )

    assert response.status_code == 200
    item = response.json()["item"]
    assert item["Nombre"] == "Pasaporte"
    assert item["Responsables"] == [{"IdUsuario": responsable.IdUsuario, "NombreCompleto": "Responsable Test"}]
    checklist = db_session.query(Checklist).one()
    assert checklist.Nombre == "Pasaporte"
    assert [usuario.IdUsuario for usuario in checklist.Responsables] == [responsable.IdUsuario]
    mock_checklist_broadcast.assert_awaited_once_with(viaje.IdViaje, {"tipo": "checklist_actualizado"})


@pytest.mark.parametrize(
    "payload",
    [
        {"Nombre": "", "IdCategoriaChecklist": 1},
        {"Nombre": "x" * 61, "IdCategoriaChecklist": 1},
    ],
)
def test_crear_checklist_valida_nombre(client, viaje_con_admin, payload):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/checklists",
        json=payload,
        headers=_headers(viaje.Administrador),
    )

    assert response.status_code == 422


def test_crear_checklist_rechaza_nombre_duplicado(client, viaje_con_admin, categoria_checklist):
    viaje, _ = viaje_con_admin
    usuario = viaje.Administrador

    primera = _crear_checklist(client, viaje, usuario, categoria_checklist)
    segunda = _crear_checklist(client, viaje, usuario, categoria_checklist)

    assert primera.status_code == 200
    assert segunda.status_code == 400
    assert "nombre" in segunda.json()["detail"].lower()


def test_crear_checklist_rechaza_categoria_inactiva(client, viaje_con_admin, categoria_checklist_inactiva):
    viaje, _ = viaje_con_admin

    response = _crear_checklist(client, viaje, viaje.Administrador, categoria_checklist_inactiva)

    assert response.status_code == 400


def test_crear_checklist_solo_permite_participante_aceptado(client, db_session, viaje_con_admin, categoria_checklist):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "invitado")
    _agregar_participante(db_session, viaje, invitado, estado="invitado")

    response = _crear_checklist(client, viaje, invitado, categoria_checklist)

    assert response.status_code == 403


def test_solo_participante_aceptado_puede_cambiar_estado(client, db_session, viaje_con_admin, categoria_checklist):
    viaje, _ = viaje_con_admin
    participante = _crear_usuario(db_session, "participante")
    _agregar_participante(db_session, viaje, participante)
    invitado = _crear_usuario(db_session, "invitado_estado")
    _agregar_participante(db_session, viaje, invitado, estado="invitado")
    checklist = _crear_checklist(client, viaje, viaje.Administrador, categoria_checklist).json()["item"]

    aceptado = client.patch(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{checklist['IdChecklist']}/completada",
        json={"Completada": True},
        headers=_headers(participante),
    )
    no_aceptado = client.patch(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{checklist['IdChecklist']}/completada",
        json={"Completada": False},
        headers=_headers(invitado),
    )

    assert aceptado.status_code == 200
    assert no_aceptado.status_code == 403


def test_responsable_debe_ser_participante_aceptado_y_confirmado(client, db_session, viaje_con_admin, categoria_checklist):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "invitado_responsable")
    _agregar_participante(db_session, viaje, invitado, estado="invitado")

    response = _crear_checklist(
        client,
        viaje,
        viaje.Administrador,
        categoria_checklist,
        responsables=[invitado.IdUsuario],
    )

    assert response.status_code == 400


def test_marcar_y_desmarcar_checklist_persiste_inmediatamente(client, db_session, viaje_con_admin, categoria_checklist, mock_checklist_broadcast):
    viaje, _ = viaje_con_admin
    checklist = _crear_checklist(client, viaje, viaje.Administrador, categoria_checklist).json()["item"]

    marcar = client.patch(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{checklist['IdChecklist']}/completada",
        json={"Completada": True},
        headers=_headers(viaje.Administrador),
    )
    assert marcar.status_code == 200
    assert marcar.json()["item"]["Completada"] is True
    assert db_session.get(Checklist, checklist["IdChecklist"]).Completada is True

    desmarcar = client.patch(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{checklist['IdChecklist']}/completada",
        json={"Completada": False},
        headers=_headers(viaje.Administrador),
    )
    assert desmarcar.status_code == 200
    assert db_session.get(Checklist, checklist["IdChecklist"]).Completada is False
    assert mock_checklist_broadcast.await_count == 3


def test_editar_checklist_solo_creador_y_notifica(client, db_session, viaje_con_admin, categoria_checklist, mock_checklist_broadcast):
    viaje, _ = viaje_con_admin
    creador = viaje.Administrador
    otro = _crear_usuario(db_session, "otro")
    _agregar_participante(db_session, viaje, otro)
    otra_categoria = CategoriasChecklist(Nombre="Equipaje", Activo=True)
    db_session.add(otra_categoria)
    db_session.commit()
    db_session.refresh(otra_categoria)
    checklist = _crear_checklist(client, viaje, creador, categoria_checklist).json()["item"]

    forbidden = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{checklist['IdChecklist']}",
        json={"Nombre": "Editada"},
        headers=_headers(otro),
    )
    assert forbidden.status_code == 403

    updated = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{checklist['IdChecklist']}",
        json={
            "Nombre": "Equipaje listo",
            "IdCategoriaChecklist": otra_categoria.IdCategoriaChecklist,
            "IdsResponsables": [otro.IdUsuario],
        },
        headers=_headers(creador),
    )
    assert updated.status_code == 200
    assert updated.json()["item"]["Nombre"] == "Equipaje listo"
    persisted = db_session.get(Checklist, checklist["IdChecklist"])
    assert persisted.Nombre == "Equipaje listo"
    assert persisted.IdCategoriaChecklist == otra_categoria.IdCategoriaChecklist
    assert [usuario.IdUsuario for usuario in persisted.Responsables] == [otro.IdUsuario]
    assert mock_checklist_broadcast.await_count == 2


def test_editar_checklist_rechaza_nombre_vacio_y_duplicado(client, viaje_con_admin, categoria_checklist):
    viaje, _ = viaje_con_admin
    creador = viaje.Administrador
    primera = _crear_checklist(client, viaje, creador, categoria_checklist, nombre="Primera").json()["item"]
    segunda = _crear_checklist(client, viaje, creador, categoria_checklist, nombre="Segunda").json()["item"]

    vacio = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{primera['IdChecklist']}",
        json={"Nombre": "   "},
        headers=_headers(creador),
    )
    duplicado = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{segunda['IdChecklist']}",
        json={"Nombre": "Primera"},
        headers=_headers(creador),
    )

    assert vacio.status_code == 400
    assert duplicado.status_code == 400


def test_eliminar_checklist_solo_creador_y_persiste(client, db_session, viaje_con_admin, categoria_checklist, mock_checklist_broadcast):
    viaje, _ = viaje_con_admin
    creador = viaje.Administrador
    otro = _crear_usuario(db_session, "lector")
    _agregar_participante(db_session, viaje, otro)
    checklist = _crear_checklist(client, viaje, creador, categoria_checklist).json()["item"]

    forbidden = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{checklist['IdChecklist']}",
        headers=_headers(otro),
    )
    assert forbidden.status_code == 403

    deleted = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{checklist['IdChecklist']}",
        headers=_headers(creador),
    )
    assert deleted.status_code == 200
    assert db_session.get(Checklist, checklist["IdChecklist"]) is None
    assert mock_checklist_broadcast.await_count == 2

"""Tests de la HU 71 - Visualizar invitaciones enviadas."""

from datetime import datetime

from app.core.security import create_access_token, hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario


def _url(viaje):
    return f"/api/v1/trips/{viaje.IdViaje}/invitations/sent"


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


def _token_de(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _invitar(db_session, viaje, usuario, estado_nombre, fecha_invitacion, invitado_por=None):
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado = db_session.query(EstadoParticipacion).filter_by(Nombre=estado_nombre).first()
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado.IdEstadoParticipacion,
        FechaInvitacion=fecha_invitacion,
        FechaRespuesta=None if estado_nombre == "invitado" else fecha_invitacion,
        InvitadoPor=invitado_por or viaje.IdAdministrador,
    )
    db_session.add(participacion)
    db_session.commit()
    return participacion


def _escenario(db_session, viaje):
    """Una invitacion por estado, enviadas en dias distintos."""
    pendiente = _crear_usuario(db_session, "pepe_pendiente")
    aceptada = _crear_usuario(db_session, "ana_aceptada")
    rechazada = _crear_usuario(db_session, "rita_rechazada")
    _invitar(db_session, viaje, pendiente, "invitado", datetime(2026, 9, 3, 10, 0))
    _invitar(db_session, viaje, aceptada, "aceptado", datetime(2026, 9, 1, 10, 0))
    _invitar(db_session, viaje, rechazada, "rechazado", datetime(2026, 9, 2, 10, 0))
    return pendiente, aceptada, rechazada


# PU 1 / CA 1 / CA 7
def test_admin_visualiza_listado_de_invitaciones_ordenado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _escenario(db_session, viaje)

    response = client.get(_url(viaje), headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert [item["nombreUsuario"] for item in body] == [
        "pepe_pendiente",
        "rita_rechazada",
        "ana_aceptada",
    ]


def test_listado_no_incluye_al_administrador(client, auth_headers, usuario_activo, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = client.get(_url(viaje), headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == []


# PU 2, 3, 4 / CA 2 / CA 5
def test_cada_invitacion_muestra_usuario_estado_y_fecha(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _escenario(db_session, viaje)

    body = client.get(_url(viaje), headers=auth_headers).json()
    por_usuario = {item["nombreUsuario"]: item for item in body}

    assert por_usuario["pepe_pendiente"]["status"] == "pendiente"
    assert por_usuario["ana_aceptada"]["status"] == "aceptada"
    assert por_usuario["rita_rechazada"]["status"] == "rechazada"
    assert por_usuario["pepe_pendiente"]["invitedAt"].startswith("2026-09-03")
    assert por_usuario["pepe_pendiente"]["respondedAt"] is None


def test_no_incluye_participaciones_expulsadas_ni_salidas(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _invitar(db_session, viaje, _crear_usuario(db_session, "exp"), "expulsado", datetime(2026, 9, 1))
    _invitar(db_session, viaje, _crear_usuario(db_session, "sal"), "salio", datetime(2026, 9, 1))

    body = client.get(_url(viaje), headers=auth_headers).json()

    assert body == []


# PU 5 / CA 4 (+ PU sugeridos para aceptada y rechazada)
def test_filtrar_por_estado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _escenario(db_session, viaje)

    for estado, usuario_esperado in [
        ("pendiente", "pepe_pendiente"),
        ("aceptada", "ana_aceptada"),
        ("rechazada", "rita_rechazada"),
    ]:
        response = client.get(_url(viaje), params={"estado": estado}, headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["nombreUsuario"] == usuario_esperado
        assert body[0]["status"] == estado


def test_filtrar_por_estado_sin_resultados_devuelve_lista_vacia(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _invitar(db_session, viaje, _crear_usuario(db_session, "pepe"), "invitado", datetime(2026, 9, 1))

    response = client.get(_url(viaje), params={"estado": "rechazada"}, headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == []


def test_filtrar_por_estado_invalido(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = client.get(_url(viaje), params={"estado": "vencida"}, headers=auth_headers)

    assert response.status_code == 422


# PU 6 / PU 13 / CA 3
def test_participante_no_administrador_no_puede_ver_el_listado(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    participante = _crear_usuario(db_session, "participante")
    _invitar(db_session, viaje, participante, "aceptado", datetime(2026, 9, 1))

    response = client.get(_url(viaje), headers=_token_de(participante))

    assert response.status_code == 403


def test_usuario_ajeno_al_viaje_no_puede_ver_el_listado(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    ajeno = _crear_usuario(db_session, "ajeno")

    response = client.get(_url(viaje), headers=_token_de(ajeno))

    assert response.status_code == 403


def test_requiere_autenticacion(client, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = client.get(_url(viaje))

    assert response.status_code == 401


def test_viaje_inexistente(client, master_data, auth_headers):
    response = client.get("/api/v1/trips/9999/invitations/sent", headers=auth_headers)

    assert response.status_code == 404

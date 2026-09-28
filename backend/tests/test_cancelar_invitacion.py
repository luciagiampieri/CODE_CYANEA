"""Tests de la HU 72 - Cancelar invitación enviada."""

from datetime import date, datetime

from app.core.security import create_access_token, hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario


def _url(viaje, usuario):
    return f"/api/v1/trips/{viaje.IdViaje}/invitations/{usuario.IdUsuario}/cancel"


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


def _invitar(db_session, viaje, usuario, estado_nombre="invitado"):
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado = db_session.query(EstadoParticipacion).filter_by(Nombre=estado_nombre).first()
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado.IdEstadoParticipacion,
        FechaInvitacion=datetime(2026, 9, 1, 10, 0),
        InvitadoPor=viaje.IdAdministrador,
    )
    db_session.add(participacion)
    db_session.commit()
    return participacion


def _estado_de(db_session, viaje, usuario):
    db_session.expire_all()
    participacion = (
        db_session.query(ParticipanteViaje)
        .filter_by(IdViaje=viaje.IdViaje, IdUsuario=usuario.IdUsuario)
        .first()
    )
    return participacion.EstadoParticipacion.Nombre


# PU 1 / PU 6 / CA 4 / CA 6
def test_admin_cancela_invitacion_pendiente(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)

    response = client.post(_url(viaje, invitado), headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["message"] == "Invitación cancelada correctamente"
    assert _estado_de(db_session, viaje, invitado) == "cancelada"


# PU 2 / CA 1
def test_participante_no_administrador_no_puede_cancelar(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    participante = _crear_usuario(db_session, "carlos")
    _invitar(db_session, viaje, participante, "aceptado")
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)

    response = client.post(_url(viaje, invitado), headers=_token_de(participante))

    assert response.status_code == 403
    assert _estado_de(db_session, viaje, invitado) == "invitado"


def test_usuario_ajeno_al_viaje_no_puede_cancelar(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)
    ajeno = _crear_usuario(db_session, "ajeno")

    response = client.post(_url(viaje, invitado), headers=_token_de(ajeno))

    assert response.status_code == 403


# PU 3 / CA 2
def test_no_se_puede_cancelar_invitacion_aceptada_o_rechazada(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    aceptado = _crear_usuario(db_session, "ana")
    rechazado = _crear_usuario(db_session, "rita")
    _invitar(db_session, viaje, aceptado, "aceptado")
    _invitar(db_session, viaje, rechazado, "rechazado")

    for usuario, estado in [(aceptado, "aceptado"), (rechazado, "rechazado")]:
        response = client.post(_url(viaje, usuario), headers=auth_headers)
        assert response.status_code == 409
        assert _estado_de(db_session, viaje, usuario) == estado


def test_no_se_puede_cancelar_dos_veces(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)

    assert client.post(_url(viaje, invitado), headers=auth_headers).status_code == 200
    assert client.post(_url(viaje, invitado), headers=auth_headers).status_code == 409


def test_cancelar_invitacion_inexistente(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    sin_invitacion = _crear_usuario(db_session, "nadie")

    response = client.post(_url(viaje, sin_invitacion), headers=auth_headers)

    assert response.status_code == 404


def test_no_se_puede_cancelar_en_viaje_finalizado(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)
    viaje.FechaInicio = date(2020, 1, 1)
    viaje.FechaFin = date(2020, 1, 10)
    db_session.commit()

    response = client.post(_url(viaje, invitado), headers=auth_headers)

    assert response.status_code == 409
    assert _estado_de(db_session, viaje, invitado) == "invitado"


def test_no_se_puede_aceptar_una_invitacion_cancelada(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)
    client.post(_url(viaje, invitado), headers=auth_headers)

    response = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "aceptar"},
        headers=_token_de(invitado),
    )

    assert response.status_code == 409
    assert "cancelada" in response.json()["detail"]
    assert _estado_de(db_session, viaje, invitado) == "cancelada"


def test_invitacion_cancelada_desaparece_de_pendientes_del_invitado(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)
    headers_invitado = _token_de(invitado)
    assert len(client.get("/api/v1/trips/invitations/pending", headers=headers_invitado).json()) == 1

    client.post(_url(viaje, invitado), headers=auth_headers)

    assert client.get("/api/v1/trips/invitations/pending", headers=headers_invitado).json() == []


def test_invitado_cancelado_pierde_acceso_al_viaje(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)
    headers_invitado = _token_de(invitado)
    assert client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=headers_invitado).status_code == 200

    client.post(_url(viaje, invitado), headers=auth_headers)

    assert client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=headers_invitado).status_code == 403


def test_invitacion_cancelada_no_aparece_en_invitaciones_enviadas(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)

    client.post(_url(viaje, invitado), headers=auth_headers)
    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/invitations/sent", headers=auth_headers)

    assert response.json() == []


def test_se_puede_volver_a_invitar_luego_de_cancelar(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)
    client.post(_url(viaje, invitado), headers=auth_headers)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"userId": invitado.IdUsuario},
        headers=auth_headers,
    )

    assert response.status_code == 201
    assert _estado_de(db_session, viaje, invitado) == "invitado"
    pendientes = client.get("/api/v1/trips/invitations/pending", headers=_token_de(invitado)).json()
    assert len(pendientes) == 1


def test_se_notifica_al_invitado_la_cancelacion(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)

    client.post(_url(viaje, invitado), headers=auth_headers)

    notificaciones = db_session.query(Notificacion).filter_by(IdUsuario=invitado.IdUsuario).all()
    assert len(notificaciones) == 1
    assert notificaciones[0].Tipo == "invitacion_cancelada"
    assert viaje.Titulo in notificaciones[0].Mensaje
    assert (
        db_session.query(Notificacion).filter_by(IdUsuario=usuario_activo.IdUsuario).count() == 0
    )


def test_la_notificacion_aparece_en_el_listado_del_invitado(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "pepe")
    _invitar(db_session, viaje, invitado)

    client.post(_url(viaje, invitado), headers=auth_headers)
    response = client.get("/api/v1/notificaciones", headers=_token_de(invitado))

    assert response.status_code == 200
    assert any(item.get("tipo") == "invitacion_cancelada" for item in response.json())
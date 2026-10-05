"""Volver a invitar a alguien que rechazó la invitación (extensión de la HU 72)."""

from tests.test_cancelar_invitacion import _crear_usuario, _estado_de, _invitar, _token_de


def _url_participantes(viaje):
    return f"/api/v1/trips/{viaje.IdViaje}/participants"


def test_se_puede_volver_a_invitar_a_quien_rechazo(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "camila")
    _invitar(db_session, viaje, invitado, estado_nombre="rechazado")

    response = client.post(
        _url_participantes(viaje), json={"userId": invitado.IdUsuario}, headers=auth_headers
    )

    assert response.status_code == 201
    assert response.json()["message"] == "Invitación reenviada correctamente"
    assert _estado_de(db_session, viaje, invitado) == "invitado"
    # La invitación vuelve a aparecer como pendiente para la persona invitada
    pendientes = client.get("/api/v1/trips/invitations/pending", headers=_token_de(invitado)).json()
    assert len(pendientes) == 1


def test_se_puede_volver_a_invitar_por_email_a_quien_rechazo(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "lucia")
    _invitar(db_session, viaje, invitado, estado_nombre="rechazado")

    response = client.post(
        _url_participantes(viaje), json={"email": invitado.Email}, headers=auth_headers
    )

    assert response.status_code == 201
    assert _estado_de(db_session, viaje, invitado) == "invitado"


def test_reinvitar_borra_la_respuesta_anterior(client, db_session, auth_headers, viaje_con_admin):
    from datetime import datetime

    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "tici")
    participacion = _invitar(db_session, viaje, invitado, estado_nombre="rechazado")
    participacion.FechaRespuesta = datetime(2026, 9, 2, 12, 0)
    db_session.commit()

    client.post(_url_participantes(viaje), json={"userId": invitado.IdUsuario}, headers=auth_headers)

    db_session.expire_all()
    db_session.refresh(participacion)
    assert participacion.FechaRespuesta is None


def test_no_se_puede_reinvitar_a_quien_ya_tiene_invitacion_pendiente_o_acepto(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    for nombre, estado in [("pendiente1", "invitado"), ("aceptado1", "aceptado")]:
        usuario = _crear_usuario(db_session, nombre)
        _invitar(db_session, viaje, usuario, estado_nombre=estado)

        response = client.post(
            _url_participantes(viaje), json={"userId": usuario.IdUsuario}, headers=auth_headers
        )

        assert response.status_code == 409, estado
        assert _estado_de(db_session, viaje, usuario) == estado


def test_solo_el_administrador_puede_volver_a_invitar(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "rechazo2")
    _invitar(db_session, viaje, invitado, estado_nombre="rechazado")
    participante = _crear_usuario(db_session, "participante2")
    _invitar(db_session, viaje, participante, estado_nombre="aceptado")

    response = client.post(
        _url_participantes(viaje),
        json={"userId": invitado.IdUsuario},
        headers=_token_de(participante),
    )

    assert response.status_code in (403, 404)
    assert _estado_de(db_session, viaje, invitado) == "rechazado"

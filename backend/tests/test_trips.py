from datetime import date as date_type, datetime, timedelta

import pytest

from app.api.routes import trips as trips_module
from app.core.security import hash_password, create_access_token
from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.notificacion import Notificacion
from unittest.mock import AsyncMock

@pytest.fixture(autouse=True)
def _mock_broadcast_to_trip(monkeypatch):
    broadcast_mock = AsyncMock()

    monkeypatch.setattr(
        trips_module.manager,
        "broadcast_to_trip",
        broadcast_mock,
    )

    return broadcast_mock


def _crear_usuario(db_session, nombre_usuario, activo=True):
    usuario = Usuario(
        Nombre=nombre_usuario.capitalize(), Apellido="Test", NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com", HashedPassword=hash_password("Password123!"),
        Activo=activo, EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _token_de(usuario):
    return {"Authorization": f"Bearer {create_access_token({'sub': usuario.Email, 'user_id': usuario.IdUsuario})}"}


def _agregar_participante(db_session, viaje, usuario, estado_nombre="invitado", rol_nombre="participante"):
    rol = db_session.query(RolParticipante).filter_by(Nombre=rol_nombre).first()
    estado = db_session.query(EstadoParticipacion).filter_by(Nombre=estado_nombre).first()
    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado.IdEstadoParticipacion,
    )
    db_session.add(participante)
    db_session.commit()
    db_session.refresh(participante)
    return participante


TRIP_PAYLOAD = {
    "title": "Viaje a Bariloche",
    "startDate": "2026-12-01",
    "endDate": "2026-12-10",
    "currency": "ARS",
    "destinations": [
        {"name": "Bariloche", "country": "Argentina", "lat": -41.15, "lng": -71.31}
    ],
    "participantUserIds": [],
    "invitedEmails": [],
}


def test_create_trip_requires_authentication(client):
    response = client.post("/api/v1/trips", json=TRIP_PAYLOAD)
    assert response.status_code == 401


def test_create_trip_success(client, master_data, auth_headers):
    response = client.post("/api/v1/trips", json=TRIP_PAYLOAD, headers=auth_headers)
    assert response.status_code == 201
    assert response.json()["title"] == "Viaje a Bariloche"


def test_list_trips_empty_for_new_user(client, master_data, auth_headers):
    response = client.get("/api/v1/trips", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_trip_rejects_empty_destinations(client, master_data, auth_headers):
    payload = {**TRIP_PAYLOAD, "destinations": []}
    response = client.post("/api/v1/trips", json=payload, headers=auth_headers)
    assert response.status_code == 422


def test_get_trip_detail_not_found(client, master_data, auth_headers):
    response = client.get("/api/v1/trips/9999", headers=auth_headers)
    assert response.status_code == 404


def test_generate_route_returns_503_when_feature_unavailable(client, auth_headers):
    if trips_module.ROUTE_GENERATION_AVAILABLE:
        pytest.skip("La generación de rutas está disponible en este entorno")

    response = client.post("/api/v1/trips/1/days/1/route", headers=auth_headers)
    assert response.status_code == 503


def test_update_trip_success(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    payload = {
        "title": "Viaje actualizado",
        "description": "Nueva descripcion",
        "startDate": "2026-12-01",
        "endDate": "2026-12-15",
        "destinations": [{"name": "Bariloche", "country": "Argentina", "lat": -41.15, "lng": -71.31}],
    }
    response = client.put(f"/api/v1/trips/{viaje.IdViaje}", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["trip"]["title"] == "Viaje actualizado"


def test_update_trip_forbidden_for_non_admin(client, db_session, viaje_con_admin):
    from app.core.security import hash_password, create_access_token
    from app.models.usuario import Usuario
    from app.models.participante_viaje import ParticipanteViaje
    from app.models.rol_participante import RolParticipante
    from app.models.estado_participacion import EstadoParticipacion

    viaje, _ = viaje_con_admin
    otro = Usuario(
        Nombre="Otro", Apellido="Participante", NombreUsuario="otro_part",
        Email="otro@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(otro)
    db_session.flush()

    rol_participante = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    db_session.add(ParticipanteViaje(
        IdViaje=viaje.IdViaje, IdUsuario=otro.IdUsuario,
        IdRolParticipante=rol_participante.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    ))
    db_session.commit()
    db_session.refresh(otro)

    token = create_access_token({"sub": otro.Email, "user_id": otro.IdUsuario})
    payload = {
        "title": "Intento ajeno",
        "startDate": "2026-12-01",
        "endDate": "2026-12-15",
        "destinations": [{"name": "Bariloche", "country": "Argentina", "lat": -41.15, "lng": -71.31}],
    }
    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}", json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_delete_trip_success(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.delete(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert response.status_code == 200

    seguimiento = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert seguimiento.status_code == 403


def test_delete_trip_not_found(client, auth_headers):
    response = client.delete("/api/v1/trips/9999", headers=auth_headers)
    assert response.status_code == 404


def test_get_trip_detail_success(client, auth_headers, usuario_activo, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Viaje de test"
    assert body["admin"]["id"] == usuario_activo.IdUsuario
    assert usuario_activo.IdUsuario in body["participantUserIds"]


def test_get_pending_invitations_requires_auth(client):
    response = client.get("/api/v1/trips/invitations/pending")
    assert response.status_code == 401


def test_get_pending_invitations_lista_solo_estado_invitado(client, db_session, master_data, auth_headers, usuario_activo):
    admin_otro_viaje = _crear_usuario(db_session, "admin_otro")
    estado_activo = db_session.query(EstadoViaje).filter_by(Nombre="activo").first()
    viaje = Viaje(
        Titulo="Viaje ajeno", FechaInicio=date_type(2026, 12, 1), FechaFin=date_type(2026, 12, 10),
        IdEstadoViaje=estado_activo.IdEstadoViaje, Moneda="ARS",
        IdAdministrador=admin_otro_viaje.IdUsuario,
    )
    db_session.add(viaje)
    db_session.commit()
    _agregar_participante(db_session, viaje, usuario_activo, estado_nombre="invitado")

    response = client.get("/api/v1/trips/invitations/pending", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["tripId"] == viaje.IdViaje
    assert body[0]["status"] == "invitado"


def test_get_pending_invitations_vacio_si_no_hay_invitaciones(client, master_data, auth_headers):
    response = client.get("/api/v1/trips/invitations/pending", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_respond_invitation_aceptar_success(client, db_session, master_data, auth_headers, usuario_activo):
    admin_otro = _crear_usuario(db_session, "admin_otro2")
    estado_activo = db_session.query(EstadoViaje).filter_by(Nombre="activo").first()
    viaje = Viaje(
        Titulo="Viaje ajeno", FechaInicio=date_type(2026, 12, 1), FechaFin=date_type(2026, 12, 10),
        IdEstadoViaje=estado_activo.IdEstadoViaje, Moneda="ARS",
        IdAdministrador=admin_otro.IdUsuario,
    )
    db_session.add(viaje)
    db_session.commit()
    _agregar_participante(db_session, viaje, usuario_activo, estado_nombre="invitado")

    response = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "aceptar"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    participacion = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje, IdUsuario=usuario_activo.IdUsuario
    ).first()
    assert participacion.EstadoParticipacion.Nombre == "aceptado"


def test_respond_invitation_rechazar_success(client, db_session, master_data, auth_headers, usuario_activo):
    admin_otro = _crear_usuario(db_session, "admin_otro3")
    estado_activo = db_session.query(EstadoViaje).filter_by(Nombre="activo").first()
    viaje = Viaje(
        Titulo="Viaje ajeno", FechaInicio=date_type(2026, 12, 1), FechaFin=date_type(2026, 12, 10),
        IdEstadoViaje=estado_activo.IdEstadoViaje, Moneda="ARS",
        IdAdministrador=admin_otro.IdUsuario,
    )
    db_session.add(viaje)
    db_session.commit()
    _agregar_participante(db_session, viaje, usuario_activo, estado_nombre="invitado")

    response = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "rechazar"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    participacion = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje, IdUsuario=usuario_activo.IdUsuario
    ).first()
    assert participacion.EstadoParticipacion.Nombre == "rechazado"


def test_respond_invitation_ya_respondida(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "aceptar"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_respond_invitation_no_encontrada(client, master_data, auth_headers):
    response = client.post(
        "/api/v1/trips/invitations/9999/respond",
        json={"decision": "aceptar"},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_respond_invitation_decision_invalida(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "tal_vez"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_add_participant_by_user_id_success(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    nuevo = _crear_usuario(db_session, "nuevo_part")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"userId": nuevo.IdUsuario},
        headers=auth_headers,
    )
    assert response.status_code == 201

    participacion = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje, IdUsuario=nuevo.IdUsuario
    ).first()
    assert participacion is not None
    assert participacion.EstadoParticipacion.Nombre == "invitado"


def test_add_participant_requires_admin(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    no_admin = _crear_usuario(db_session, "no_admin")
    _agregar_participante(db_session, viaje, no_admin, estado_nombre="aceptado")
    nuevo = _crear_usuario(db_session, "candidato")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"userId": nuevo.IdUsuario},
        headers=_token_de(no_admin),
    )
    assert response.status_code == 403


def test_add_participant_administrador_ya_forma_parte(client, usuario_activo, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"userId": usuario_activo.IdUsuario},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_add_participant_usuario_ya_agregado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    ya_agregado = _crear_usuario(db_session, "ya_agregado")
    _agregar_participante(db_session, viaje, ya_agregado, estado_nombre="invitado")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"userId": ya_agregado.IdUsuario},
        headers=auth_headers,
    )
    assert response.status_code == 409


def test_add_participant_by_email_usuario_existente(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    existente = _crear_usuario(db_session, "existente_email")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"email": existente.Email},
        headers=auth_headers,
    )
    assert response.status_code == 201

    participacion = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje, IdUsuario=existente.IdUsuario
    ).first()
    assert participacion is not None


def test_add_participant_by_email_nuevo_crea_invitacion_externa(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"email": "desconocido@afuera.com"},
        headers=auth_headers,
    )
    assert response.status_code == 201

    invitacion = db_session.query(InvitacionViaje).filter_by(
        IdViaje=viaje.IdViaje, EmailInvitado="desconocido@afuera.com"
    ).first()
    assert invitacion is not None


def test_add_participant_email_administrador_rechaza(client, usuario_activo, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"email": usuario_activo.Email},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_add_participant_email_invitacion_pendiente_duplicada(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    primero = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"email": "repetido@afuera.com"},
        headers=auth_headers,
    )
    assert primero.status_code == 201

    segundo = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"email": "repetido@afuera.com"},
        headers=auth_headers,
    )
    assert segundo.status_code == 409


def test_remove_participant_success(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    participante = _crear_usuario(db_session, "a_sacar")
    _agregar_participante(db_session, viaje, participante, estado_nombre="aceptado")

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/participants/{participante.IdUsuario}",
        headers=auth_headers,
    )
    assert response.status_code == 200

    assert db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje, IdUsuario=participante.IdUsuario
    ).first() is None


def test_remove_participant_no_se_puede_sacar_admin(client, usuario_activo, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/participants/{usuario_activo.IdUsuario}",
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_remove_participant_no_encontrado(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/participants/9999",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_remove_participant_requires_admin(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    no_admin = _crear_usuario(db_session, "no_admin_del")
    _agregar_participante(db_session, viaje, no_admin, estado_nombre="aceptado")

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/participants/{no_admin.IdUsuario}",
        headers=_token_de(no_admin),
    )
    assert response.status_code == 403


def test_remove_external_invitation_success(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"email": "borrame@afuera.com"},
        headers=auth_headers,
    )
    response = client.request(
        "DELETE",
        f"/api/v1/trips/{viaje.IdViaje}/external-invitations",
        json={"email": "borrame@afuera.com"},
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_remove_external_invitation_no_encontrada(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.request(
        "DELETE",
        f"/api/v1/trips/{viaje.IdViaje}/external-invitations",
        json={"email": "noexiste@afuera.com"},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_remove_external_invitation_requires_email(client, usuario_activo, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.request(
        "DELETE",
        f"/api/v1/trips/{viaje.IdViaje}/external-invitations",
        json={"userId": usuario_activo.IdUsuario},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_get_trip_detail_rechaza_no_miembro(client, db_session, master_data, viaje_con_admin):
    """US69 - CA4: solo los participantes del viaje pueden acceder al listado/detalle."""
    viaje, _ = viaje_con_admin
    ajeno = _crear_usuario(db_session, "ajeno_al_viaje")

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=_token_de(ajeno))
    assert response.status_code == 403


def test_get_trip_detail_incluye_nombre_usuario_y_rol_por_participante(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    """US69 - CA2/CA3: cada participante debe traer nombreUsuario, y el admin debe ser
    identificable a través del campo role (usado por el frontend para el badge de admin)."""
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "otro_participante")
    _agregar_participante(db_session, viaje, invitado, estado_nombre="aceptado", rol_nombre="participante")

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()

    admin_data = next(p for p in body["participants"] if p["id"] == usuario_activo.IdUsuario)
    assert admin_data["nombreUsuario"] == "ana_test"
    assert admin_data["role"] == "administrador"

    invitado_data = next(p for p in body["participants"] if p["id"] == invitado.IdUsuario)
    assert invitado_data["nombreUsuario"] == "otro_participante"
    assert invitado_data["role"] == "participante"

def test_leave_trip_participante_success(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "participante_sale")
    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(participante),
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Has abandonado el viaje correctamente."

    participacion = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje,
        IdUsuario=participante.IdUsuario,
    ).first()

    assert participacion is not None
    assert participacion.EstadoParticipacion.Nombre == "salio"


def test_leave_trip_crea_notificacion_al_administrador(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "participante_notif")
    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(participante),
    )

    assert response.status_code == 200

    notificacion = db_session.query(Notificacion).filter_by(
        IdUsuario=usuario_activo.IdUsuario,
        IdViaje=viaje.IdViaje,
        Tipo="participante_salio",
    ).first()

    assert notificacion is not None
    assert notificacion.Titulo == "Un participante abandonó el viaje"
    assert participante.Nombre in notificacion.Mensaje
    assert participante.Apellido in notificacion.Mensaje
    assert viaje.Titulo in notificacion.Mensaje
    assert notificacion.Leida is False


def test_leave_trip_rechaza_viaje_finalizado(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "participante_finalizado")
    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    estado_finalizado = db_session.query(EstadoViaje).filter_by(
        Nombre="finalizado"
    ).first()

    viaje.IdEstadoViaje = estado_finalizado.IdEstadoViaje
    db_session.commit()

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(participante),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "No puedes abandonar un viaje que no está activo"
    )


def test_leave_trip_rechaza_viaje_cancelado(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "participante_cancelado")
    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    estado_cancelado = db_session.query(EstadoViaje).filter_by(
        Nombre="cancelado"
    ).first()

    viaje.IdEstadoViaje = estado_cancelado.IdEstadoViaje
    db_session.commit()

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(participante),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "No puedes abandonar un viaje que no está activo"
    )


def test_leave_trip_requiere_confirmacion(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "sin_confirmar")
    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": False},
        headers=_token_de(participante),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Debes confirmar que deseas abandonar el viaje"
    )


def test_leave_trip_rechaza_usuario_no_participante(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    usuario = _crear_usuario(db_session, "usuario_ajeno")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(usuario),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "No eres participante de este viaje"
    )


def test_leave_trip_rechaza_participacion_no_aceptada(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "participante_invitado")
    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="invitado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(participante),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "No puedes abandonar este viaje porque no tenes una participación activa"
    )


def test_leave_trip_participante_no_puede_seleccionar_nuevo_administrador(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "participante_no_admin")
    nuevo_usuario = _crear_usuario(db_session, "nuevo_usuario")

    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    _agregar_participante(
        db_session,
        viaje,
        nuevo_usuario,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={
            "confirmar": True,
            "nuevoAdministradorId": nuevo_usuario.IdUsuario,
        },
        headers=_token_de(participante),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Solo el administrador puede seleccionar un nuevo administrador."
    )


def test_leave_trip_admin_debe_seleccionar_nuevo_administrador(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(
        db_session,
        "participante_debe_seleccionar_admin",
    )

    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Debes seleccionar un nuevo administrador antes de abandonar el viaje."
    )


def test_leave_trip_admin_no_puede_seleccionarse_a_si_mismo(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(
        db_session,
        "participante_otro_admin",
    )

    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={
            "confirmar": True,
            "nuevoAdministradorId": viaje.IdAdministrador,
        },
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "No puedes asignarte a ti mismo como nuevo administrador."
    )


def test_leave_trip_admin_reasigna_administrador(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    nuevo_admin = _crear_usuario(db_session, "nuevo_admin")

    _agregar_participante(
        db_session,
        viaje,
        nuevo_admin,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={
            "confirmar": True,
            "nuevoAdministradorId": nuevo_admin.IdUsuario,
        },
        headers=auth_headers,
    )

    assert response.status_code == 200

    db_session.refresh(viaje)

    assert viaje.IdAdministrador == nuevo_admin.IdUsuario

    participacion_admin = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario_activo.IdUsuario,
    ).first()

    participacion_nuevo_admin = db_session.query(
        ParticipanteViaje
    ).filter_by(
        IdViaje=viaje.IdViaje,
        IdUsuario=nuevo_admin.IdUsuario,
    ).first()

    rol_participante = db_session.query(RolParticipante).filter_by(
        Nombre="participante"
    ).first()

    rol_administrador = db_session.query(RolParticipante).filter_by(
        Nombre="administrador"
    ).first()

    assert participacion_admin.EstadoParticipacion.Nombre == "salio"
    assert participacion_admin.IdRolParticipante == (
        rol_participante.IdRolParticipante
    )

    assert participacion_nuevo_admin.EstadoParticipacion.Nombre == "aceptado"
    assert participacion_nuevo_admin.IdRolParticipante == (
        rol_administrador.IdRolParticipante
    )


def test_leave_trip_admin_crea_notificacion_al_nuevo_administrador(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    nuevo_admin = _crear_usuario(db_session, "nuevo_admin_notif")

    _agregar_participante(
        db_session,
        viaje,
        nuevo_admin,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={
            "confirmar": True,
            "nuevoAdministradorId": nuevo_admin.IdUsuario,
        },
        headers=auth_headers,
    )

    assert response.status_code == 200

    notificacion = db_session.query(Notificacion).filter_by(
        IdUsuario=nuevo_admin.IdUsuario,
        IdViaje=viaje.IdViaje,
        Tipo="nuevo_administrador",
    ).first()

    assert notificacion is not None
    assert notificacion.Titulo == "Ahora eres el administrador del viaje"
    assert usuario_activo.Nombre in notificacion.Mensaje
    assert usuario_activo.Apellido in notificacion.Mensaje
    assert viaje.Titulo in notificacion.Mensaje
    assert notificacion.Leida is False


def test_leave_trip_admin_rechaza_nuevo_administrador_no_participante(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(
        db_session,
        "participante_existente",
    )

    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    usuario = _crear_usuario(db_session, "usuario_no_participante")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={
            "confirmar": True,
            "nuevoAdministradorId": usuario.IdUsuario,
        },
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "El usuario seleccionado no es un participante activo del viaje."
    )


def test_leave_trip_admin_rechaza_nuevo_administrador_inactivo(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    usuario = _crear_usuario(
        db_session,
        "usuario_inactivo_admin",
        activo=False,
    )

    _agregar_participante(
        db_session,
        viaje,
        usuario,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={
            "confirmar": True,
            "nuevoAdministradorId": usuario.IdUsuario,
        },
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "El usuario seleccionado no es un participante activo del viaje."
    )

def test_leave_trip_hace_broadcast(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    _mock_broadcast_to_trip,
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(
        db_session,
        "participante_broadcast",
    )

    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(participante),
    )

    assert response.status_code == 200

    _mock_broadcast_to_trip.assert_awaited_once()

    args = _mock_broadcast_to_trip.await_args.args

    assert args[0] == viaje.IdViaje
    assert args[1]["tipo"] == "usuario_abandono_viaje"
    assert args[1]["trip_id"] == viaje.IdViaje
    assert args[1]["message"] == "Un participante abandonó el viaje."


def test_leave_trip_admin_unico_cancela_viaje(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=auth_headers,
    )

    assert response.status_code == 200

    db_session.refresh(viaje)

    assert viaje.IdEstadoViaje == db_session.query(EstadoViaje).filter_by(
        Nombre="cancelado"
    ).first().IdEstadoViaje

    participacion = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje,
        IdUsuario=viaje.IdAdministrador,
    ).first()

    assert participacion.EstadoParticipacion.Nombre == "salio"


def test_leave_trip_usuario_que_abandono_no_puede_modificar(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "participante_sin_permisos")

    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(participante),
    )

    assert response.status_code == 200

    payload = {
        "title": "Intento de modificación",
        "description": "No debería poder modificar",
        "startDate": "2026-12-01",
        "endDate": "2026-12-15",
        "destinations": [
            {
                "name": "Bariloche",
                "country": "Argentina",
                "lat": -41.15,
                "lng": -71.31,
            }
        ],
    }

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}",
        json=payload,
        headers=_token_de(participante),
    )

    assert response.status_code == 403


def test_leave_trip_usuario_que_abandono_puede_consultar(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin

    participante = _crear_usuario(db_session, "participante_consulta")

    _agregar_participante(
        db_session,
        viaje,
        participante,
        estado_nombre="aceptado",
        rol_nombre="participante",
    )

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(participante),
    )

    assert response.status_code == 200

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}",
        headers=_token_de(participante),
    )

    assert response.status_code == 200
    assert response.json()["title"] == viaje.Titulo

def test_add_participant_reinvitacion_usuario_que_salio_success(
    client, db_session, auth_headers, viaje_con_admin
):
    """Verifica que un usuario que abandonó el viaje pueda ser invitado nuevamente (reincorporado)."""
    viaje, _ = viaje_con_admin
    ex_participante = _crear_usuario(db_session, "ex_participante")
    
    # 1. El usuario es agregado y luego abandona
    _agregar_participante(db_session, viaje, ex_participante, estado_nombre="aceptado", rol_nombre="participante")
    
    response_leave = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(ex_participante),
    )
    assert response_leave.status_code == 200

    # 2. El administrador lo vuelve a invitar
    response_invite = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"userId": ex_participante.IdUsuario},
        headers=auth_headers,
    )
    assert response_invite.status_code == 201

    participacion = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje, IdUsuario=ex_participante.IdUsuario
    ).first()
    
    assert participacion.EstadoParticipacion.Nombre == "invitado"
    assert participacion.FechaSalida is not None # Mantiene el histórico hasta que acepte


def test_respond_invitation_reincorporado_limpia_fecha_salida(
    client, db_session, auth_headers, viaje_con_admin
):
    """Verifica que si un ex-participante acepta la nueva invitación, se limpie su fecha de salida."""
    viaje, _ = viaje_con_admin
    ex_participante = _crear_usuario(db_session, "ex_participante_acepta")
    
    _agregar_participante(db_session, viaje, ex_participante, estado_nombre="aceptado", rol_nombre="participante")
    
    client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=_token_de(ex_participante),
    )

    client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"userId": ex_participante.IdUsuario},
        headers=auth_headers,
    )

    # El usuario acepta la re-invitación
    response_resp = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "aceptar"},
        headers=_token_de(ex_participante),
    )
    assert response_resp.status_code == 200

    participacion = db_session.query(ParticipanteViaje).filter_by(
        IdViaje=viaje.IdViaje, IdUsuario=ex_participante.IdUsuario
    ).first()
    
    assert participacion.EstadoParticipacion.Nombre == "aceptado"
    assert participacion.FechaSalida is None


def test_leave_trip_admin_notifica_al_nuevo_administrador(
    client, db_session, auth_headers, viaje_con_admin
):
    """Verifica que al transferir la administración por abandono, se cree la notificación correspondiente."""
    viaje, _ = viaje_con_admin
    nuevo_admin = _crear_usuario(db_session, "nuevo_admin_test")
    _agregar_participante(db_session, viaje, nuevo_admin, estado_nombre="aceptado", rol_nombre="participante")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True, "nuevoAdministradorId": nuevo_admin.IdUsuario},
        headers=auth_headers,
    )
    assert response.status_code == 200

    notificacion = db_session.query(Notificacion).filter_by(
        IdUsuario=nuevo_admin.IdUsuario,
        Tipo="nuevo_administrador"
    ).first()
    
    assert notificacion is not None
    assert "administrador" in notificacion.Titulo.lower()
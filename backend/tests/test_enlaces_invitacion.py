from datetime import datetime, timedelta, timezone, date
from unittest.mock import AsyncMock

import pytest

from app.core.security import create_access_token
from app.models.enlace_invitacion_viaje import EnlaceInvitacionViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_invitacion import EstadoInvitacion
from app.models.invitacion_viaje import InvitacionViaje
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario
from app.models.plan import Plan
from app.services.notifications import dispatcher
from app.api.routes import enlaces_invitacion as rutas


@pytest.fixture(autouse=True)
def avisos(monkeypatch):
    monkeypatch.setattr(rutas.manager, "broadcast_to_trip", AsyncMock())
    monkeypatch.setattr(rutas.manager, "broadcast_to_user", AsyncMock())
    monkeypatch.setattr(dispatcher, "_send_email_notifications", AsyncMock())
    monkeypatch.setattr(dispatcher, "_send_push_notifications", AsyncMock())


@pytest.fixture
def invitado(db_session, usuario_activo):
    usuario = Usuario(
        Nombre="Nueva",
        Apellido="Persona",
        NombreUsuario="nueva_persona",
        Email="nueva@test.com",
        HashedPassword=usuario_activo.HashedPassword,
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    return usuario


def headers(usuario):
    return {
        "Authorization": "Bearer "
        + create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    }


def administracion(viaje):
    return f"/api/v1/trips/{viaje.IdViaje}/enlace-invitacion"


def generar(client, viaje, auth_headers):
    result = client.post(administracion(viaje), headers=auth_headers, json={})
    assert result.status_code == 200, result.text
    return result.json()["url"].rsplit("/", 1)[1]


def consulta(token):
    return f"/api/v1/invitaciones/enlaces/{token}"


def agregar(db, viaje, base, nombre, estado="aceptado"):
    usuario = Usuario(
        Nombre=nombre,
        Apellido="Test",
        NombreUsuario=nombre,
        Email=f"{nombre}@test.com",
        HashedPassword=base.HashedPassword,
        Activo=True,
        EmailConfirmado=True,
    )
    db.add(usuario)
    db.flush()
    db.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=db.query(RolParticipante)
            .filter_by(Nombre="participante")
            .one()
            .IdRolParticipante,
            IdEstadoParticipacion=db.query(EstadoParticipacion)
            .filter_by(Nombre=estado)
            .one()
            .IdEstadoParticipacion,
        )
    )
    db.commit()
    return usuario


def test_cupo_incluye_administrador_y_se_modifica_en_bd_sin_reiniciar(
    client, db_session, viaje_con_admin, auth_headers, invitado
):
    viaje, _ = viaje_con_admin
    token = generar(client, viaje, auth_headers)
    agregar(db_session, viaje, invitado, "segundo")
    cuarto = agregar(db_session, viaje, invitado, "cuarto", "invitado")
    assert client.post(consulta(token) + "/unirse", headers=headers(invitado)).status_code == 200
    lleno = client.post(consulta(token) + "/unirse", headers=headers(cuarto))
    assert lleno.status_code == 409
    assert lleno.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"
    assert "3 participantes" in lleno.json()["detail"]["mensaje"]
    plan = db_session.get(Plan, 1)
    plan.MaxParticipantesViaje = 4
    db_session.commit()
    assert client.post(consulta(token) + "/unirse", headers=headers(cuarto)).status_code == 200


def test_las_invitaciones_pendientes_no_reservan_cupo(
    client, db_session, viaje_con_admin, auth_headers, invitado
):
    viaje, _ = viaje_con_admin
    token = generar(client, viaje, auth_headers)
    for i in range(4):
        agregar(db_session, viaje, invitado, f"pendiente{i}", "invitado")
    assert client.post(consulta(token) + "/unirse", headers=headers(invitado)).status_code == 200


def test_se_usa_el_plan_actual_del_administrador_y_no_el_del_solicitante(
    client, db_session, viaje_con_admin, auth_headers, invitado, usuario_activo
):
    viaje, _ = viaje_con_admin
    usuario_activo.IdPlan = 2
    db_session.get(Plan, 2).MaxParticipantesViaje = 1
    db_session.get(Plan, 1).MaxParticipantesViaje = 9
    db_session.commit()
    token = generar(client, viaje, auth_headers)
    lleno = client.post(consulta(token) + "/unirse", headers=headers(invitado))
    assert lleno.status_code == 409
    assert "1 participantes" in lleno.json()["detail"]["mensaje"]
    usuario_activo.IdPlan = 1
    db_session.commit()
    assert client.post(consulta(token) + "/unirse", headers=headers(invitado)).status_code == 200


def test_aceptar_invitacion_personal_tambien_respeta_el_cupo(
    client, db_session, viaje_con_admin, invitado
):
    viaje, _ = viaje_con_admin
    agregar(db_session, viaje, invitado, "segundo")
    tercero = agregar(db_session, viaje, invitado, "tercero", "invitado")
    agregar(db_session, viaje, invitado, "cuarto")
    url = f"/api/v1/trips/invitations/{viaje.IdViaje}/respond"
    result = client.post(url, json={"decision": "aceptar"}, headers=headers(tercero))
    assert result.status_code == 409
    assert result.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"
    db_session.get(Plan, 1).MaxParticipantesViaje = 4
    db_session.commit()
    assert (
        client.post(url, json={"decision": "aceptar"}, headers=headers(tercero)).status_code == 200
    )


def test_ciclo_completo_y_rechazo_de_participante_existente(
    client, db_session, viaje_con_admin, auth_headers, invitado
):
    viaje, _ = viaje_con_admin
    assert client.get(administracion(viaje), headers=auth_headers).json()["activo"] is False
    token = generar(client, viaje, auth_headers)
    assert generar(client, viaje, auth_headers) == token
    preview = client.get(consulta(token))
    assert preview.status_code == 200
    assert set(preview.json()) == {"titulo", "administrador", "destinos", "fechaInicio", "fechaFin"}
    assert preview.json()["administrador"] == viaje.Administrador.NombreUsuario
    assert preview.headers["cache-control"] == "no-store"
    assert db_session.query(ParticipanteViaje).count() == 1  # Abrir no incorpora.
    result = client.post(consulta(token) + "/unirse", headers=headers(invitado))
    assert result.status_code == 200, result.text
    assert result.json()["idViaje"] == viaje.IdViaje
    assert result.json()["yaParticipaba"] is False
    p = (
        db_session.query(ParticipanteViaje)
        .filter_by(IdViaje=viaje.IdViaje, IdUsuario=invitado.IdUsuario)
        .one()
    )
    assert p.EstadoParticipacion.Nombre == "aceptado"
    assert p.RolParticipante.Nombre == "participante"
    assert p.FechaIncorporacion is not None
    assert p.InvitadoPor == viaje.IdAdministrador
    fecha = p.FechaIncorporacion
    repetido = client.post(consulta(token) + "/unirse", headers=headers(invitado))
    assert repetido.status_code == 409
    assert repetido.headers["X-Error-Code"] == "ALREADY_TRIP_PARTICIPANT"
    db_session.refresh(p)
    assert p.FechaIncorporacion == fecha
    assert db_session.query(ParticipanteViaje).count() == 2
    assert db_session.query(Notificacion).filter_by(Tipo="participante_incorporado").count() == 1
    assert (
        client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=headers(invitado)).status_code == 200
    )


def test_actualiza_invitacion_personal_pendiente_en_la_misma_union(
    client, db_session, viaje_con_admin, auth_headers, invitado
):
    viaje, _ = viaje_con_admin
    token = generar(client, viaje, auth_headers)
    invitacion = InvitacionViaje(
        IdViaje=viaje.IdViaje,
        EmailInvitado=invitado.Email.upper(),
        TokenInvitacion="invitacion-personal",
        InvitadoPor=viaje.IdAdministrador,
        IdEstadoInvitacion=db_session.query(EstadoInvitacion)
        .filter_by(Nombre="pendiente")
        .one()
        .IdEstadoInvitacion,
        FechaVencimiento=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db_session.add(invitacion)
    db_session.commit()
    result = client.post(consulta(token) + "/unirse", headers=headers(invitado))
    assert result.status_code == 200
    db_session.refresh(invitacion)
    assert invitacion.EstadoInvitacion.Nombre == "aceptada"
    assert invitacion.IdUsuarioRegistrado == invitado.IdUsuario
    assert invitacion.FechaAceptacion is not None


def test_preview_no_expone_nombre_privado_del_administrador(
    client, db_session, viaje_con_admin, auth_headers, usuario_activo
):
    viaje, _ = viaje_con_admin
    usuario_activo.VisibilidadNombre = "privado"
    db_session.commit()
    token = generar(client, viaje, auth_headers)
    preview = client.get(consulta(token)).json()
    assert preview["administrador"] == usuario_activo.NombreUsuario
    assert usuario_activo.Email not in str(preview)


def test_revocar_y_renovar_invalidan_anterior(client, viaje_con_admin, auth_headers, invitado):
    viaje, _ = viaje_con_admin
    viejo = generar(client, viaje, auth_headers)
    nuevo = (
        client.post(administracion(viaje), json={"renovar": True}, headers=auth_headers)
        .json()["url"]
        .rsplit("/", 1)[1]
    )
    assert nuevo != viejo
    assert client.get(consulta(viejo)).status_code == 404
    assert client.post(consulta(viejo) + "/unirse", headers=headers(invitado)).status_code == 404
    assert client.delete(administracion(viaje), headers=auth_headers).json()["activo"] is False
    assert client.get(consulta(nuevo)).status_code == 410
    assert client.post(consulta(nuevo) + "/unirse", headers=headers(invitado)).status_code == 410
    assert generar(client, viaje, auth_headers) not in (viejo, nuevo)


def test_solo_admin_gestiona(client, viaje_con_admin, auth_headers, invitado):
    viaje, _ = viaje_con_admin
    for metodo in [client.get, client.post, client.delete]:
        args = {"json": {}} if metodo == client.post else {}
        assert metodo(administracion(viaje), headers=headers(invitado), **args).status_code == 403
        assert metodo(administracion(viaje), **args).status_code == 401


@pytest.mark.parametrize("estado", ["invitado", "rechazado", "salio", "cancelada", "expulsado"])
def test_participaciones_previas(
    client, db_session, viaje_con_admin, auth_headers, invitado, estado
):
    viaje, _ = viaje_con_admin
    token = generar(client, viaje, auth_headers)
    p = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=invitado.IdUsuario,
        IdRolParticipante=db_session.query(RolParticipante)
        .filter_by(Nombre="participante")
        .one()
        .IdRolParticipante,
        IdEstadoParticipacion=db_session.query(EstadoParticipacion)
        .filter_by(Nombre=estado)
        .one()
        .IdEstadoParticipacion,
        FechaSalida=datetime.now(timezone.utc) if estado == "salio" else None,
    )
    db_session.add(p)
    db_session.commit()
    result = client.post(consulta(token) + "/unirse", headers=headers(invitado))
    if estado in {"cancelada", "expulsado"}:
        assert result.status_code == 403
        assert result.headers["X-Error-Code"] == "INVITATION_MEMBERSHIP_BLOCKED"
    else:
        assert result.status_code == 200
        db_session.refresh(p)
        assert p.EstadoParticipacion.Nombre == "aceptado" and p.FechaSalida is None
    assert db_session.query(ParticipanteViaje).count() == 2


@pytest.mark.parametrize("estado", ["finalizado", "cancelado", "eliminado", "fecha_pasada"])
def test_viaje_cerrado(client, db_session, viaje_con_admin, auth_headers, invitado, estado):
    viaje, _ = viaje_con_admin
    token = generar(client, viaje, auth_headers)
    if estado == "fecha_pasada":
        viaje.FechaInicio = date.today() - timedelta(days=4)
        viaje.FechaFin = date.today() - timedelta(days=1)
    else:
        viaje.IdEstadoViaje = (
            db_session.query(EstadoViaje).filter_by(Nombre=estado).one().IdEstadoViaje
        )
    db_session.commit()
    assert client.get(consulta(token)).status_code == 409
    assert client.post(consulta(token) + "/unirse", headers=headers(invitado)).status_code == 409
    assert client.post(administracion(viaje), headers=auth_headers, json={}).status_code == 409
    assert db_session.query(ParticipanteViaje).count() == 1


def test_vencimiento_y_sesion_confirmada(
    client, db_session, viaje_con_admin, auth_headers, invitado
):
    viaje, _ = viaje_con_admin
    token = generar(client, viaje, auth_headers)
    assert client.post(consulta(token) + "/unirse").status_code == 401
    invitado.EmailConfirmado = False
    db_session.commit()
    response = client.post(consulta(token) + "/unirse", headers=headers(invitado))
    assert (
        response.status_code == 403
        and response.headers["X-Error-Code"] == "EMAIL_CONFIRMATION_REQUIRED"
    )
    invitado.EmailConfirmado = True
    enlace = db_session.query(EnlaceInvitacionViaje).one()
    enlace.FechaVencimiento = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    assert client.get(consulta(token)).status_code == 410
    assert client.post(consulta(token) + "/unirse", headers=headers(invitado)).status_code == 410
    assert client.get(consulta("inventado")).status_code == 404
    assert db_session.query(ParticipanteViaje).count() == 1


def test_fallo_notificacion_no_revierte(
    client, db_session, viaje_con_admin, auth_headers, invitado
):
    viaje, _ = viaje_con_admin
    token = generar(client, viaje, auth_headers)
    dispatcher._send_email_notifications.side_effect = RuntimeError("SMTP")
    rutas.manager.broadcast_to_trip.side_effect = RuntimeError("WS")
    assert client.post(consulta(token) + "/unirse", headers=headers(invitado)).status_code == 200
    assert db_session.query(ParticipanteViaje).filter_by(IdUsuario=invitado.IdUsuario).count() == 1
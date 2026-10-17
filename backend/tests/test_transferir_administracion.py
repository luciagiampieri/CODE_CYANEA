from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.api.routes import trips
from app.core.security import create_access_token
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.services.notifications import dispatcher


@pytest.fixture(autouse=True)
def notificaciones(monkeypatch):
    broadcast = AsyncMock()
    monkeypatch.setattr(trips.manager, "broadcast_to_trip", broadcast)
    monkeypatch.setattr(trips.manager, "broadcast_to_user", AsyncMock())
    monkeypatch.setattr(dispatcher, "_send_push_notifications", AsyncMock())
    monkeypatch.setattr(dispatcher, "_send_email_notifications", AsyncMock())
    return broadcast


@pytest.fixture
def candidato(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    usuario = Usuario(
        Nombre="Ana",
        Apellido="Nueva",
        NombreUsuario="nueva_admin",
        Email="nueva@test.com",
        HashedPassword=usuario_activo.HashedPassword,
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.flush()
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=db_session.query(RolParticipante)
        .filter_by(Nombre="participante")
        .one()
        .IdRolParticipante,
        IdEstadoParticipacion=db_session.query(EstadoParticipacion)
        .filter_by(Nombre="aceptado")
        .one()
        .IdEstadoParticipacion,
        FechaIncorporacion=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )
    db_session.add(participacion)
    db_session.commit()
    return usuario, participacion


def enviar(client, viaje, headers, id_nuevo):
    return client.post(
        f"/api/v1/trips/{viaje.IdViaje}/transferir-administracion",
        json={"nuevoAdministradorId": id_nuevo},
        headers=headers,
    )


def token(usuario):
    return {
        "Authorization": "Bearer "
        + create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    }


def test_transferir_conserva_grupo_y_cambia_permisos(
    client, db_session, auth_headers, viaje_con_admin, candidato, notificaciones
):
    viaje, anterior = viaje_con_admin
    nuevo, participacion = candidato
    fecha = participacion.FechaIncorporacion
    anterior_fecha = anterior.FechaIncorporacion
    result = enviar(client, viaje, auth_headers, nuevo.IdUsuario)
    assert result.status_code == 200
    db_session.expire_all()
    assert viaje.IdAdministrador == nuevo.IdUsuario
    assert viaje.FechaActualizacion is not None
    assert anterior.RolParticipante.Nombre == "participante"
    assert participacion.RolParticipante.Nombre == "administrador"
    assert (
        anterior.EstadoParticipacion.Nombre
        == participacion.EstadoParticipacion.Nombre
        == "aceptado"
    )
    assert anterior.FechaSalida is None and participacion.FechaSalida is None
    assert anterior.FechaIncorporacion == anterior_fecha
    assert participacion.FechaIncorporacion == fecha
    assert anterior.IdAdministradorAlMomentoDeSalida is None
    assert (
        db_session.query(Notificacion)
        .filter_by(IdUsuario=nuevo.IdUsuario, Tipo="nuevo_administrador")
        .count()
        == 1
    )
    notificaciones.assert_awaited_once_with(
        viaje.IdViaje, {"tipo": "administracion_transferida", "trip_id": viaje.IdViaje}
    )
    detalle = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert detalle.status_code == 200
    assert detalle.json()["admin"]["id"] == nuevo.IdUsuario
    assert detalle.json()["hasLeft"] is False
    # El administrador anterior ya no puede gestionar invitaciones ni volver a transferir.
    assert (
        client.get(
            f"/api/v1/trips/{viaje.IdViaje}/invitations/sent", headers=auth_headers
        ).status_code
        == 403
    )
    assert enviar(client, viaje, auth_headers, anterior.IdUsuario).status_code == 403
    # El nuevo administrador puede transferirla de vuelta.
    assert enviar(client, viaje, token(nuevo), anterior.IdUsuario).status_code == 200


def test_solo_admin_actual(client, viaje_con_admin, candidato):
    viaje, anterior = viaje_con_admin
    nuevo, _ = candidato
    assert enviar(client, viaje, token(nuevo), anterior.IdUsuario).status_code == 403
    assert enviar(client, viaje, {}, nuevo.IdUsuario).status_code == 401


@pytest.mark.parametrize("estado", ["invitado", "rechazado", "expulsado", "salio", "cancelada"])
def test_rechaza_destinatario_no_aceptado(
    client, db_session, auth_headers, viaje_con_admin, candidato, estado
):
    viaje, anterior = viaje_con_admin
    nuevo, participacion = candidato
    participacion.IdEstadoParticipacion = (
        db_session.query(EstadoParticipacion).filter_by(Nombre=estado).one().IdEstadoParticipacion
    )
    db_session.commit()
    assert enviar(client, viaje, auth_headers, nuevo.IdUsuario).status_code == 400
    db_session.refresh(viaje)
    assert viaje.IdAdministrador == anterior.IdUsuario


@pytest.mark.parametrize("motivo", ["inactivo", "baja", "otro_viaje", "inexistente", "mismo"])
def test_destinatarios_invalidos(
    client, db_session, auth_headers, viaje_con_admin, candidato, motivo
):
    viaje, anterior = viaje_con_admin
    nuevo, participacion = candidato
    id_nuevo = nuevo.IdUsuario
    if motivo == "inactivo":
        nuevo.Activo = False
    elif motivo == "baja":
        nuevo.FechaBaja = datetime.now(timezone.utc)
    elif motivo == "otro_viaje":
        db_session.delete(participacion)
    elif motivo == "inexistente":
        id_nuevo = 99999
    else:
        id_nuevo = anterior.IdUsuario
    db_session.commit()
    assert enviar(client, viaje, auth_headers, id_nuevo).status_code == 400
    db_session.refresh(viaje)
    assert viaje.IdAdministrador == anterior.IdUsuario
    assert db_session.query(Notificacion).count() == 0


@pytest.mark.parametrize("estado", ["finalizado", "cancelado", "eliminado", "vencido"])
def test_viaje_bloqueado(client, db_session, auth_headers, viaje_con_admin, candidato, estado):
    viaje, _ = viaje_con_admin
    nuevo, _ = candidato
    if estado == "vencido":
        viaje.FechaInicio = date.today() - timedelta(days=10)
        viaje.FechaFin = date.today() - timedelta(days=1)
    else:
        viaje.IdEstadoViaje = (
            db_session.query(EstadoViaje).filter_by(Nombre=estado).one().IdEstadoViaje
        )
    db_session.commit()
    result = enviar(client, viaje, auth_headers, nuevo.IdUsuario)
    assert result.status_code == 409
    if estado in ("vencido", "finalizado"):
        assert result.headers["X-Error-Code"] == "TRIP_FINISHED"


def test_revalida_participacion_admin(client, db_session, auth_headers, viaje_con_admin, candidato):
    viaje, anterior = viaje_con_admin
    anterior.IdEstadoParticipacion = (
        db_session.query(EstadoParticipacion).filter_by(Nombre="salio").one().IdEstadoParticipacion
    )
    db_session.commit()
    assert enviar(client, viaje, auth_headers, candidato[0].IdUsuario).status_code == 403


def test_fallo_externo_no_revierte(
    client, db_session, auth_headers, viaje_con_admin, candidato, notificaciones, monkeypatch
):
    viaje, _ = viaje_con_admin
    nuevo, _ = candidato
    notificaciones.side_effect = RuntimeError("WebSocket caído")
    dispatcher._send_email_notifications.side_effect = RuntimeError("SMTP caído")
    assert enviar(client, viaje, auth_headers, nuevo.IdUsuario).status_code == 200
    db_session.refresh(viaje)
    assert viaje.IdAdministrador == nuevo.IdUsuario
    assert db_session.query(Notificacion).filter_by(Tipo="nuevo_administrador").count() == 1


def test_datos_maestros_faltantes_no_cambian_roles(
    client, db_session, auth_headers, viaje_con_admin, candidato
):
    viaje, anterior = viaje_con_admin
    rol = db_session.query(RolParticipante).filter_by(Nombre="administrador").one()
    rol.Activo = False
    db_session.commit()
    assert enviar(client, viaje, auth_headers, candidato[0].IdUsuario).status_code == 500
    db_session.refresh(viaje)
    assert viaje.IdAdministrador == anterior.IdUsuario

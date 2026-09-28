import asyncio

from app.core.security import create_access_token, hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.token_push_usuario import TokenPushUsuario
from app.models.usuario import Usuario
from app.services.notifications import NotificationType, TripNotificationEvent, dispatch_trip_notification
from app.services.notifications.push import ExpoPushTicket


class FakePushClient:
    def __init__(self, tickets=None):
        self.messages = []
        self._tickets = tickets or []

    async def send_messages(self, messages):
        self.messages.extend(messages)
        return self._tickets


def _crear_usuario(db_session, nombre_usuario, **kwargs):
    defaults = {
        "Nombre": nombre_usuario.capitalize(),
        "Apellido": "Test",
        "NombreUsuario": nombre_usuario,
        "Email": f"{nombre_usuario}@test.com",
        "HashedPassword": hash_password("Password123!"),
        "Activo": True,
        "EmailConfirmado": True,
    }
    defaults.update(kwargs)
    usuario = Usuario(**defaults)
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _agregar_participante(db_session, viaje, usuario):
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado.IdEstadoParticipacion,
    )
    db_session.add(participante)
    db_session.commit()
    return participante


def _agregar_token(db_session, usuario, token):
    token_push = TokenPushUsuario(
        IdUsuario=usuario.IdUsuario,
        Token=token,
        Plataforma="ios",
        Activo=True,
    )
    db_session.add(token_push)
    db_session.commit()
    db_session.refresh(token_push)
    return token_push


def _auth_headers(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _evento(viaje, actor):
    return TripNotificationEvent(
        notification_type=NotificationType.CAMBIO_VIAJE,
        tipo="actividad_creada",
        titulo="Nueva actividad",
        mensaje="Se agreg? una actividad.",
        id_viaje=viaje.IdViaje,
        id_usuario_actor=actor.IdUsuario,
        data={"eventType": "activity_created", "activityId": 10},
    )


def test_push_flow_simulado_desde_preferencias_hasta_payload(
    client,
    db_session,
    viaje_con_admin,
):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    sin_consentimiento = _crear_usuario(
        db_session,
        "flow_sinpush",
        ConsienteNotificacionesPush=False,
    )
    push_desactivado = _crear_usuario(
        db_session,
        "flow_nopref",
        ConsienteNotificacionesPush=False,
    )
    elegible = _crear_usuario(
        db_session,
        "flow_okpush",
        ConsienteNotificacionesPush=False,
    )

    for usuario in (sin_consentimiento, push_desactivado, elegible):
        _agregar_participante(db_session, viaje, usuario)

    token_sin_consentimiento = _agregar_token(
        db_session,
        sin_consentimiento,
        "ExponentPushToken[sin-consentimiento-stale]",
    )

    rechazo_sin_consentimiento = client.post(
        "/api/v1/users/me/push-tokens",
        headers=_auth_headers(sin_consentimiento),
        json={
            "token": "ExponentPushToken[sin-consentimiento-nuevo]",
            "plataforma": "android",
            "dispositivoId": "pixel-8-pro",
        },
    )
    assert rechazo_sin_consentimiento.status_code == 409

    response_pref_desactivada = client.put(
        "/api/v1/users/me",
        headers=_auth_headers(push_desactivado),
        json={
            "nombre": push_desactivado.Nombre,
            "apellido": push_desactivado.Apellido,
            "nombreUsuario": push_desactivado.NombreUsuario,
            "fotoUrl": None,
            "consienteNotificacionesPush": True,
            "recibePushNuevosGastos": False,
        },
    )
    assert response_pref_desactivada.status_code == 200
    assert response_pref_desactivada.json()["consienteNotificacionesPush"] is True
    assert response_pref_desactivada.json()["recibePushNuevosGastos"] is False

    response_token_desactivado = client.post(
        "/api/v1/users/me/push-tokens",
        headers=_auth_headers(push_desactivado),
        json={
            "token": "ExponentPushToken[pref-desactivada]",
            "plataforma": "android",
            "dispositivoId": "pixel-8-pro",
        },
    )
    assert response_token_desactivado.status_code == 200

    response_pref_elegible = client.put(
        "/api/v1/users/me",
        headers=_auth_headers(elegible),
        json={
            "nombre": elegible.Nombre,
            "apellido": elegible.Apellido,
            "nombreUsuario": elegible.NombreUsuario,
            "fotoUrl": None,
            "consienteNotificacionesPush": True,
            "recibePushNuevosGastos": True,
        },
    )
    assert response_pref_elegible.status_code == 200
    assert response_pref_elegible.json()["consienteNotificacionesPush"] is True
    assert response_pref_elegible.json()["recibePushNuevosGastos"] is True

    response_token_elegible = client.post(
        "/api/v1/users/me/push-tokens",
        headers=_auth_headers(elegible),
        json={
            "token": "ExponentPushToken[elegible]",
            "plataforma": "android",
            "dispositivoId": "pixel-8-pro",
        },
    )
    assert response_token_elegible.status_code == 200

    fake_client = FakePushClient()
    evento = TripNotificationEvent(
        notification_type=NotificationType.NUEVO_GASTO,
        tipo="nuevo_gasto",
        titulo="Nuevo gasto en el viaje",
        mensaje="Se registró un gasto de prueba.",
        id_viaje=viaje.IdViaje,
        id_usuario_actor=actor.IdUsuario,
        data={
            "eventType": "expense_created",
            "expenseId": 321,
            "targetTab": "gastos",
        },
    )

    notificaciones = asyncio.run(
        dispatch_trip_notification(db_session, evento, push_client=fake_client)
    )

    assert {n.IdUsuario for n in notificaciones} == {
        sin_consentimiento.IdUsuario,
        push_desactivado.IdUsuario,
        elegible.IdUsuario,
    }
    assert db_session.query(Notificacion).filter_by(Tipo="nuevo_gasto").count() == 3
    assert [message["to"] for message in fake_client.messages] == ["ExponentPushToken[elegible]"]
    assert fake_client.messages[0] == {
        "to": "ExponentPushToken[elegible]",
        "title": "Nuevo gasto en el viaje",
        "body": "Se registró un gasto de prueba.",
        "sound": "default",
        "channelId": "cyanea-trips",
        "data": {
            "tipo": "nuevo_gasto",
            "notificationType": "nuevo_gasto",
            "tripId": viaje.IdViaje,
            "eventType": "expense_created",
            "expenseId": 321,
            "targetTab": "gastos",
        },
    }

    db_session.refresh(token_sin_consentimiento)
    assert token_sin_consentimiento.Activo is True
    assert (
        db_session.query(TokenPushUsuario)
        .filter_by(Token="ExponentPushToken[sin-consentimiento-nuevo]")
        .first()
        is None
    )


def test_dispatch_creates_in_app_notifications_and_filters_push_by_consent_and_preferences(
    db_session,
    viaje_con_admin,
):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    sin_consentimiento = _crear_usuario(db_session, "sinpush", ConsienteNotificacionesPush=False)
    push_desactivado = _crear_usuario(
        db_session,
        "nopref",
        ConsienteNotificacionesPush=True,
        RecibePushCambiosViaje=False,
    )
    elegible = _crear_usuario(db_session, "okpush", ConsienteNotificacionesPush=True)

    for usuario in (sin_consentimiento, push_desactivado, elegible):
        _agregar_participante(db_session, viaje, usuario)
        _agregar_token(db_session, usuario, f"ExponentPushToken[{usuario.NombreUsuario}]")

    fake_client = FakePushClient()
    notificaciones = asyncio.run(
        dispatch_trip_notification(db_session, _evento(viaje, actor), push_client=fake_client)
    )

    assert len(notificaciones) == 3
    assert db_session.query(Notificacion).count() == 3
    assert [message["to"] for message in fake_client.messages] == ["ExponentPushToken[okpush]"]
    assert fake_client.messages[0]["data"] == {
        "tipo": "actividad_creada",
        "notificationType": "cambio_viaje",
        "tripId": viaje.IdViaje,
        "eventType": "activity_created",
        "activityId": 10,
    }


def test_dispatch_deactivates_device_not_registered_tokens(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    usuario = _crear_usuario(db_session, "invalidpush", ConsienteNotificacionesPush=True)
    _agregar_participante(db_session, viaje, usuario)
    token = _agregar_token(db_session, usuario, "ExponentPushToken[invalid]")

    fake_client = FakePushClient(
        tickets=[
            ExpoPushTicket(
                token="ExponentPushToken[invalid]",
                status="error",
                error="DeviceNotRegistered",
            )
        ]
    )

    asyncio.run(dispatch_trip_notification(db_session, _evento(viaje, actor), push_client=fake_client))

    db_session.refresh(token)
    assert token.Activo is False
    assert token.FechaBaja is not None

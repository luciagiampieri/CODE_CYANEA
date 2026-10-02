"""Tests de la US 60: configurar preferencias de notificaciones.

Cubren los criterios de aceptación (tipos independientes, canales separados,
consentimiento explícito con fecha y persistencia) y los casos de prueba
1 a 5 de la historia.
"""

import asyncio
from datetime import date

import pytest

from app.core.config import settings
from app.models.dia_cronograma import DiaCronograma
from app.models.token_push_usuario import TokenPushUsuario
from app.services.notifications import (
    NotificationService,
    NotificationType,
    TripNotificationEvent,
    dispatch_trip_notification,
)
from app.services.notifications import dispatcher as dispatcher_module
from tests.test_push_notifications_dispatcher import (
    FakePushClient,
    _agregar_participante,
    _agregar_token,
    _auth_headers,
    _crear_usuario,
)


class _FakeMail:
    def __init__(self):
        self.enviados = []

    def send_template(self, **kwargs):
        self.enviados.append(kwargs)

    def send_html(self, **kwargs):
        self.enviados.append(kwargs)


@pytest.fixture()
def correo_habilitado(monkeypatch):
    """Activa el envío de mail y lo redirige a un servicio falso."""
    fake_mail = _FakeMail()
    monkeypatch.setattr(settings, "mail_enabled", True)
    monkeypatch.setattr(
        dispatcher_module,
        "get_notification_service",
        lambda: NotificationService(mail_service=fake_mail),
    )
    return fake_mail


def _payload_perfil(usuario, **cambios):
    return {
        "nombre": usuario.Nombre,
        "apellido": usuario.Apellido,
        "nombreUsuario": usuario.NombreUsuario,
        "fotoUrl": None,
        **cambios,
    }


def _evento(viaje, actor, notification_type, tipo="evento_test"):
    return TripNotificationEvent(
        notification_type=notification_type,
        tipo=tipo,
        titulo=f"Evento {tipo}",
        mensaje="Mensaje de prueba.",
        id_viaje=viaje.IdViaje,
        id_usuario_actor=actor.IdUsuario,
    )


# --- Persistencia y consentimiento (CA 3 y CA 4) ---------------------------


def test_get_me_expone_preferencias_de_nuevas_actividades_y_fechas(client, auth_headers):
    response = client.get("/api/v1/users/me", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["recibeEmailsNuevasActividades"] is True
    assert body["recibePushNuevasActividades"] is True
    assert body["fechaConsentimientoNotificacionesEmail"] is None
    assert body["fechaConsentimientoNotificacionesPush"] is None


def test_otorgar_consentimiento_email_registra_fecha_y_revocarlo_la_limpia(
    client, auth_headers, usuario_activo
):
    otorgar = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json=_payload_perfil(usuario_activo, consienteNotificacionesEmail=True),
    )
    assert otorgar.status_code == 200
    assert otorgar.json()["consienteNotificacionesEmail"] is True
    fecha = otorgar.json()["fechaConsentimientoNotificacionesEmail"]
    assert fecha is not None

    # Volver a enviar el consentimiento ya otorgado no cambia la fecha original.
    reenviar = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json=_payload_perfil(usuario_activo, consienteNotificacionesEmail=True),
    )
    assert reenviar.json()["fechaConsentimientoNotificacionesEmail"] == fecha

    revocar = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json=_payload_perfil(usuario_activo, consienteNotificacionesEmail=False),
    )
    assert revocar.json()["consienteNotificacionesEmail"] is False
    assert revocar.json()["fechaConsentimientoNotificacionesEmail"] is None


def test_revocar_consentimiento_push_limpia_fecha_y_da_de_baja_tokens(
    client, db_session, auth_headers, usuario_activo
):
    otorgar = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json=_payload_perfil(usuario_activo, consienteNotificacionesPush=True),
    )
    assert otorgar.json()["fechaConsentimientoNotificacionesPush"] is not None

    token = _agregar_token(db_session, usuario_activo, "ExponentPushToken[revocar]")

    revocar = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json=_payload_perfil(usuario_activo, consienteNotificacionesPush=False),
    )
    assert revocar.json()["fechaConsentimientoNotificacionesPush"] is None

    db_session.refresh(token)
    assert token.Activo is False
    assert token.FechaBaja is not None


def test_caso_1_guarda_preferencias_independientes_por_tipo_y_canal(
    client, auth_headers, usuario_activo
):
    response = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json=_payload_perfil(
            usuario_activo,
            consienteNotificacionesPush=True,
            recibePushNuevosGastos=True,
            recibePushNuevaVotacion=False,
            recibePushNuevasActividades=False,
            recibeEmailsNuevasActividades=True,
        ),
    )
    assert response.status_code == 200

    # Se relee con GET para verificar que quedó persistido.
    body = client.get("/api/v1/users/me", headers=auth_headers).json()
    assert body["recibePushNuevosGastos"] is True
    assert body["recibePushNuevaVotacion"] is False
    assert body["recibePushNuevasActividades"] is False
    assert body["recibeEmailsNuevasActividades"] is True
    # Desactivar nuevas actividades no afecta a cambios en el viaje.
    assert body["recibePushCambiosViaje"] is True


def test_editar_perfil_sin_preferencias_no_toca_consentimiento_ni_fechas(
    client, auth_headers, usuario_activo
):
    client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json=_payload_perfil(usuario_activo, consienteNotificacionesEmail=True),
    )

    response = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json=_payload_perfil(usuario_activo, nombre="Ana Maria"),
    )

    assert response.json()["consienteNotificacionesEmail"] is True
    assert response.json()["fechaConsentimientoNotificacionesEmail"] is not None


# --- Despacho push (casos 2, 3 y 5) ----------------------------------------


def test_caso_2_envia_push_de_nuevo_gasto_a_quien_tiene_la_preferencia_activa(
    db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    destinatario = _crear_usuario(db_session, "gastoon", ConsienteNotificacionesPush=True)
    _agregar_participante(db_session, viaje, destinatario)
    _agregar_token(db_session, destinatario, "ExponentPushToken[gastoon]")

    fake_push = FakePushClient()
    asyncio.run(
        dispatch_trip_notification(
            db_session, _evento(viaje, actor, NotificationType.NUEVO_GASTO), push_client=fake_push
        )
    )

    assert [m["to"] for m in fake_push.messages] == ["ExponentPushToken[gastoon]"]


def test_caso_3_no_envia_push_de_votacion_a_quien_desactivo_esa_categoria(
    db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    sin_votaciones = _crear_usuario(
        db_session, "sinvotos", ConsienteNotificacionesPush=True, RecibePushNuevaVotacion=False
    )
    con_votaciones = _crear_usuario(db_session, "convotos", ConsienteNotificacionesPush=True)
    for usuario in (sin_votaciones, con_votaciones):
        _agregar_participante(db_session, viaje, usuario)
        _agregar_token(db_session, usuario, f"ExponentPushToken[{usuario.NombreUsuario}]")

    fake_push = FakePushClient()
    notificaciones = asyncio.run(
        dispatch_trip_notification(
            db_session, _evento(viaje, actor, NotificationType.NUEVA_VOTACION), push_client=fake_push
        )
    )

    assert [m["to"] for m in fake_push.messages] == ["ExponentPushToken[convotos]"]
    # La notificación in-app se registra igual para ambos.
    assert {n.IdUsuario for n in notificaciones} == {
        sin_votaciones.IdUsuario,
        con_votaciones.IdUsuario,
    }


def test_nuevas_actividades_se_filtra_independiente_de_cambios_en_el_viaje(
    db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    sin_actividades = _crear_usuario(
        db_session,
        "sinact",
        ConsienteNotificacionesPush=True,
        RecibePushNuevasActividades=False,
        RecibePushCambiosViaje=True,
    )
    _agregar_participante(db_session, viaje, sin_actividades)
    _agregar_token(db_session, sin_actividades, "ExponentPushToken[sinact]")

    push_actividad = FakePushClient()
    asyncio.run(
        dispatch_trip_notification(
            db_session,
            _evento(viaje, actor, NotificationType.NUEVA_ACTIVIDAD),
            push_client=push_actividad,
        )
    )
    assert push_actividad.messages == []

    push_cambio = FakePushClient()
    asyncio.run(
        dispatch_trip_notification(
            db_session,
            _evento(viaje, actor, NotificationType.CAMBIO_VIAJE),
            push_client=push_cambio,
        )
    )
    assert [m["to"] for m in push_cambio.messages] == ["ExponentPushToken[sinact]"]


def test_caso_5_un_cambio_de_preferencia_via_api_se_aplica_al_siguiente_envio(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    usuario = _crear_usuario(db_session, "multidisp", ConsienteNotificacionesPush=True)
    _agregar_participante(db_session, viaje, usuario)
    _agregar_token(db_session, usuario, "ExponentPushToken[movil]")

    # El cambio se hace por la API (como desde el portal web)...
    response = client.put(
        "/api/v1/users/me",
        headers=_auth_headers(usuario),
        json=_payload_perfil(usuario, recibePushNuevosGastos=False),
    )
    assert response.status_code == 200
    db_session.expire_all()

    # ...y el siguiente envío al dispositivo móvil ya lo respeta.
    fake_push = FakePushClient()
    asyncio.run(
        dispatch_trip_notification(
            db_session, _evento(viaje, actor, NotificationType.NUEVO_GASTO), push_client=fake_push
        )
    )
    assert fake_push.messages == []


# --- Despacho email (CA 2, caso 4) -----------------------------------------


def test_envia_email_solo_a_quien_consintio_y_tiene_la_preferencia_activa(
    db_session, viaje_con_admin, correo_habilitado
):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    elegible = _crear_usuario(db_session, "mailok", ConsienteNotificacionesEmail=True)
    sin_consentimiento = _crear_usuario(db_session, "mailsincons", ConsienteNotificacionesEmail=False)
    sin_preferencia = _crear_usuario(
        db_session,
        "mailsinpref",
        ConsienteNotificacionesEmail=True,
        RecibeEmailsNuevasActividades=False,
    )
    for usuario in (elegible, sin_consentimiento, sin_preferencia):
        _agregar_participante(db_session, viaje, usuario)

    asyncio.run(
        dispatch_trip_notification(
            db_session,
            _evento(viaje, actor, NotificationType.NUEVA_ACTIVIDAD, tipo="actividad_creada"),
            push_client=FakePushClient(),
        )
    )

    assert [mail["to"] for mail in correo_habilitado.enviados] == [["mailok@test.com"]]
    enviado = correo_habilitado.enviados[0]
    assert enviado["template_name"] == "trip_event_notification.html"
    assert enviado["text_template_name"] == "trip_event_notification.txt"
    assert enviado["context"]["event_label"] == "Nueva actividad"
    assert enviado["context"]["trip_title"] == viaje.Titulo
    assert enviado["context"]["trip_url"].endswith(f"/viajes/{viaje.IdViaje}")


def test_caso_4_no_envia_emails_a_quien_revoco_el_consentimiento(
    client, db_session, viaje_con_admin, correo_habilitado
):
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    usuario = _crear_usuario(db_session, "revoca", ConsienteNotificacionesEmail=True)
    _agregar_participante(db_session, viaje, usuario)

    response = client.put(
        "/api/v1/users/me",
        headers=_auth_headers(usuario),
        json=_payload_perfil(usuario, consienteNotificacionesEmail=False),
    )
    assert response.status_code == 200
    db_session.expire_all()

    asyncio.run(
        dispatch_trip_notification(
            db_session,
            _evento(viaje, actor, NotificationType.CAMBIO_VIAJE),
            push_client=FakePushClient(),
        )
    )

    assert correo_habilitado.enviados == []


def test_no_envia_emails_si_el_correo_esta_deshabilitado(
    db_session, viaje_con_admin, monkeypatch
):
    monkeypatch.setattr(settings, "mail_enabled", False)
    fake_mail = _FakeMail()
    monkeypatch.setattr(
        dispatcher_module,
        "get_notification_service",
        lambda: NotificationService(mail_service=fake_mail),
    )
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    usuario = _crear_usuario(db_session, "maildeshab", ConsienteNotificacionesEmail=True)
    _agregar_participante(db_session, viaje, usuario)

    asyncio.run(
        dispatch_trip_notification(
            db_session,
            _evento(viaje, actor, NotificationType.NUEVO_GASTO),
            push_client=FakePushClient(),
        )
    )

    assert fake_mail.enviados == []


def test_un_error_de_email_no_impide_registrar_la_notificacion_in_app(
    db_session, viaje_con_admin, monkeypatch
):
    class _MailQueFalla:
        def send_template(self, **kwargs):
            raise RuntimeError("SMTP caido")

    monkeypatch.setattr(settings, "mail_enabled", True)
    monkeypatch.setattr(
        dispatcher_module,
        "get_notification_service",
        lambda: NotificationService(mail_service=_MailQueFalla()),
    )
    viaje, _ = viaje_con_admin
    actor = viaje.Administrador
    usuario = _crear_usuario(db_session, "smtpcaido", ConsienteNotificacionesEmail=True)
    _agregar_participante(db_session, viaje, usuario)

    notificaciones = asyncio.run(
        dispatch_trip_notification(
            db_session,
            _evento(viaje, actor, NotificationType.NUEVO_GASTO),
            push_client=FakePushClient(),
        )
    )

    assert [n.IdUsuario for n in notificaciones] == [usuario.IdUsuario]


# --- Endpoint de actividades (CA 1) ----------------------------------------


def test_crear_actividad_notifica_como_nueva_actividad(
    client, db_session, auth_headers, viaje_con_admin, monkeypatch
):
    from app.api.routes import trips as trips_module

    eventos = []

    async def _capturar(db, event, push_client=None):
        eventos.append(event)
        return []

    async def _sin_ruta(db, dia, trip_id):
        return None

    monkeypatch.setattr(trips_module, "dispatch_trip_notification", _capturar)
    monkeypatch.setattr(trips_module, "_sincronizar_y_notificar_ruta", _sin_ruta)

    viaje, _ = viaje_con_admin
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 2), IndiceDia=1)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}/activities",
        headers=auth_headers,
        json={"nombre": "Coliseo", "horaInicio": "10:00", "horaFin": "12:00"},
    )

    assert response.status_code == 201, response.text
    assert len(eventos) == 1
    assert eventos[0].notification_type == NotificationType.NUEVA_ACTIVIDAD
    assert eventos[0].tipo == "actividad_creada"

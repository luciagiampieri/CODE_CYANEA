import asyncio
from datetime import date as date_type, datetime, time

from app.core.security import hash_password
from app.core.config import settings
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.token_push_usuario import TokenPushUsuario
from app.models.usuario import Usuario
from app.services.notifications.activity_reminders import scan_and_dispatch_activity_reminders
from app.services.notifications.dispatcher import TripNotificationEvent, dispatch_trip_notification
from app.services.notifications.push import ExpoPushTicket
from app.services.notifications.service import NotificationType


class FakePushClient:
    def __init__(self):
        self.messages = []

    async def send_messages(self, messages):
        self.messages.extend(messages)
        return [ExpoPushTicket(token=message["to"], status="ok") for message in messages]


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


def _crear_actividad(db_session, viaje, fecha=date_type(2026, 12, 1), hora=time(10, 0)):
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=fecha, IndiceDia=1)
    db_session.add(dia)
    db_session.flush()
    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        Nombre="Museo",
        HoraInicio=hora,
        HoraFin=time(11, 0),
        Icono="landmark",
    )
    db_session.add(actividad)
    db_session.commit()
    db_session.refresh(actividad)
    return actividad


def test_scan_activity_reminders_crea_notificacion_una_sola_vez(db_session, viaje_con_admin, monkeypatch):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "recordado")
    _agregar_participante(db_session, viaje, invitado)
    _crear_actividad(db_session, viaje)
    monkeypatch.setattr(settings, "activity_reminder_minutes_before", 60)

    now = datetime(2026, 12, 1, 9, 15)
    primera = asyncio.run(scan_and_dispatch_activity_reminders(db_session, now=now))
    segunda = asyncio.run(scan_and_dispatch_activity_reminders(db_session, now=now))

    assert primera == 1
    assert segunda == 0
    notificaciones = db_session.query(Notificacion).order_by(Notificacion.IdNotificacion).all()
    assert len(notificaciones) == 2
    assert {n.IdUsuario for n in notificaciones} == {viaje.IdAdministrador, invitado.IdUsuario}
    assert {n.Tipo for n in notificaciones} == {"recordatorio_actividad"}


def test_recordatorio_actividad_filtra_push_por_preferencia(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    habilitado = _crear_usuario(
        db_session,
        "pushactividad",
        ConsienteNotificacionesPush=True,
        RecibePushRecordatoriosActividad=True,
    )
    deshabilitado = _crear_usuario(
        db_session,
        "sinactividad",
        ConsienteNotificacionesPush=True,
        RecibePushRecordatoriosActividad=False,
    )
    for usuario in (habilitado, deshabilitado):
        _agregar_participante(db_session, viaje, usuario)
        db_session.add(
            TokenPushUsuario(
                IdUsuario=usuario.IdUsuario,
                Token=f"ExponentPushToken[{usuario.NombreUsuario}]",
                Plataforma="ios",
                Activo=True,
            )
        )
    db_session.commit()

    fake_client = FakePushClient()
    asyncio.run(
        dispatch_trip_notification(
            db_session,
            TripNotificationEvent(
                notification_type=NotificationType.RECORDATORIO_ACTIVIDAD,
                tipo="recordatorio_actividad",
                titulo="Actividad pr?xima",
                mensaje="Museo empieza en 30 min.",
                id_viaje=viaje.IdViaje,
                data={"eventType": "activity_reminder"},
            ),
            push_client=fake_client,
        )
    )

    assert [message["to"] for message in fake_client.messages] == ["ExponentPushToken[pushactividad]"]

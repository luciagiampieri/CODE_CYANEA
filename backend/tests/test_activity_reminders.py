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


def test_scan_busca_y_registra_recordatorios_fuera_del_hilo_del_event_loop(
    db_session, viaje_con_admin, monkeypatch
):
    """Las consultas del scheduler corren en el threadpool: no frenan el event loop."""
    import threading

    from sqlalchemy import event

    from tests.conftest import engine

    viaje, _ = viaje_con_admin
    _crear_actividad(db_session, viaje)
    monkeypatch.setattr(settings, "activity_reminder_minutes_before", 60)

    hilos = {}

    def registrar(conn, cursor, statement, parameters, context, executemany):
        if "RecordatoriosActividadesNotificados" in statement or (
            "ActividadesItinerario" in statement and "EstadosViajes" in statement
        ):
            hilos.setdefault("busqueda", set()).add(threading.get_ident())

    async def escanear():
        hilos["event_loop"] = threading.get_ident()
        return await scan_and_dispatch_activity_reminders(
            db_session, now=datetime(2026, 12, 1, 9, 15)
        )

    event.listen(engine, "before_cursor_execute", registrar)
    try:
        enviadas = asyncio.run(escanear())
    finally:
        event.remove(engine, "before_cursor_execute", registrar)

    assert enviadas == 1
    assert hilos["busqueda"], "la búsqueda debería consultar la base"
    assert hilos["event_loop"] not in hilos["busqueda"]


def test_falla_en_un_recordatorio_no_impide_los_demas(
    db_session, viaje_con_admin, monkeypatch, caplog
):
    """Los recordatorios del ciclo se registran antes de notificar: si el envío de uno
    falla, los demás se notifican igual."""
    import logging

    from app.models.recordatorio_actividad_notificado import RecordatorioActividadNotificado
    from app.services.notifications import activity_reminders

    viaje, _ = viaje_con_admin
    primera = _crear_actividad(db_session, viaje, hora=time(10, 0))
    segunda = ActividadItinerario(
        IdDiaCronograma=primera.IdDiaCronograma,
        Nombre="Teatro",
        # Dentro de la ventana: now 09:15 + 60 min llega hasta las 10:15.
        HoraInicio=time(10, 10),
        HoraFin=time(11, 10),
        Icono="ticket",
    )
    db_session.add(segunda)
    db_session.commit()
    db_session.refresh(segunda)
    monkeypatch.setattr(settings, "activity_reminder_minutes_before", 60)

    intentos = []
    dispatch_real = activity_reminders.dispatch_trip_notification

    async def dispatch_que_falla_la_primera_vez(db, event, *args, **kwargs):
        intentos.append(event.data["activityId"])
        if len(intentos) == 1:
            raise RuntimeError("push caído")
        return await dispatch_real(db, event, *args, **kwargs)

    monkeypatch.setattr(
        activity_reminders, "dispatch_trip_notification", dispatch_que_falla_la_primera_vez
    )

    with caplog.at_level(logging.ERROR, logger=activity_reminders.__name__):
        enviadas = asyncio.run(
            scan_and_dispatch_activity_reminders(db_session, now=datetime(2026, 12, 1, 9, 15))
        )

    assert enviadas == 1
    assert sorted(intentos) == sorted([primera.IdActividad, segunda.IdActividad])
    fallida, notificada = intentos
    nombres = {primera.IdActividad: "Museo", segunda.IdActividad: "Teatro"}

    mensajes = [
        n.Mensaje
        for n in db_session.query(Notificacion).filter_by(Tipo="recordatorio_actividad").all()
    ]
    assert mensajes, "la segunda actividad debería notificarse"
    assert all(m.startswith(nombres[notificada]) for m in mensajes)
    assert not any(m.startswith(nombres[fallida]) for m in mensajes)

    # Las dos quedan registradas: el registro sigue yendo antes del envío.
    registradas = {
        r.IdActividad for r in db_session.query(RecordatorioActividadNotificado).all()
    }
    assert registradas == {primera.IdActividad, segunda.IdActividad}

    assert any(
        f"No se pudo notificar el recordatorio de la actividad {fallida}" in r.getMessage()
        for r in caplog.records
    )

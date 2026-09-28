import asyncio
import logging
import os
from contextlib import suppress
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_viaje import EstadoViaje
from app.models.recordatorio_actividad_notificado import RecordatorioActividadNotificado
from app.models.viaje import Viaje
from app.services.notifications.dispatcher import TripNotificationEvent, dispatch_trip_notification
from app.services.notifications.service import NotificationType


logger = logging.getLogger(__name__)
_RECORDATORIO_INICIO_ACTIVIDAD = "inicio_actividad"


def activity_reminders_should_start() -> bool:
    return settings.activity_reminders_enabled and "PYTEST_CURRENT_TEST" not in os.environ


async def scan_and_dispatch_activity_reminders(
    db: Session,
    now: datetime | None = None,
) -> int:
    ahora = now or datetime.now()
    minutos_antes = settings.activity_reminder_minutes_before
    hasta = ahora + timedelta(minutes=minutos_antes)
    actividades = _load_candidate_activities(db, ahora, hasta)
    enviadas = 0

    for actividad in actividades:
        inicio = datetime.combine(actividad.DiaCronograma.Fecha, actividad.HoraInicio)
        if inicio < ahora or inicio > hasta:
            continue
        if _was_activity_reminder_sent(db, actividad.IdActividad, minutos_antes):
            continue
        if not _mark_activity_reminder_sent(db, actividad.IdActividad, minutos_antes):
            continue

        viaje = actividad.DiaCronograma.Viaje
        minutos_restantes = max(0, round((inicio - ahora).total_seconds() / 60))
        mensaje_tiempo = (
            "esta por empezar"
            if minutos_restantes == 0
            else f"empieza en {minutos_restantes} min"
        )
        await dispatch_trip_notification(
            db,
            TripNotificationEvent(
                notification_type=NotificationType.RECORDATORIO_ACTIVIDAD,
                tipo="recordatorio_actividad",
                titulo=f"Actividad proxima en {viaje.Titulo}",
                mensaje=f"{actividad.Nombre} {mensaje_tiempo}.",
                id_viaje=viaje.IdViaje,
                id_usuario_actor=None,
                data={
                    "eventType": "activity_reminder",
                    "activityId": actividad.IdActividad,
                    "dayId": actividad.IdDiaCronograma,
                    "startsAt": inicio.isoformat(),
                    "minutesBefore": minutos_antes,
                },
            ),
        )
        enviadas += 1

    return enviadas


def start_activity_reminders_scheduler() -> asyncio.Task | None:
    if not activity_reminders_should_start():
        return None
    return asyncio.create_task(_activity_reminders_loop())


async def stop_activity_reminders_scheduler(task: asyncio.Task | None) -> None:
    if task is None:
        return
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


async def _activity_reminders_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                cantidad = await scan_and_dispatch_activity_reminders(db)
                if cantidad:
                    logger.info("Recordatorios de actividad enviados: %s", cantidad)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("No se pudieron procesar recordatorios de actividades")

        await asyncio.sleep(settings.activity_reminder_scan_interval_seconds)


def _load_candidate_activities(
    db: Session,
    ahora: datetime,
    hasta: datetime,
) -> list[ActividadItinerario]:
    return list(
        db.scalars(
            select(ActividadItinerario)
            .join(DiaCronograma, DiaCronograma.IdDiaCronograma == ActividadItinerario.IdDiaCronograma)
            .join(Viaje, Viaje.IdViaje == DiaCronograma.IdViaje)
            .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
            .options(
                selectinload(ActividadItinerario.DiaCronograma)
                .selectinload(DiaCronograma.Viaje)
            )
            .where(
                DiaCronograma.Fecha >= ahora.date(),
                DiaCronograma.Fecha <= hasta.date(),
                EstadoViaje.Nombre == "activo",
            )
            .order_by(DiaCronograma.Fecha, ActividadItinerario.HoraInicio)
        ).all()
    )


def _was_activity_reminder_sent(db: Session, id_actividad: int, minutos_antes: int) -> bool:
    return db.scalar(
        select(RecordatorioActividadNotificado.IdRecordatorioActividadNotificado).where(
            RecordatorioActividadNotificado.IdActividad == id_actividad,
            RecordatorioActividadNotificado.Tipo == _RECORDATORIO_INICIO_ACTIVIDAD,
            RecordatorioActividadNotificado.MinutosAntes == minutos_antes,
        )
    ) is not None


def _mark_activity_reminder_sent(db: Session, id_actividad: int, minutos_antes: int) -> bool:
    db.add(
        RecordatorioActividadNotificado(
            IdActividad=id_actividad,
            Tipo=_RECORDATORIO_INICIO_ACTIVIDAD,
            MinutosAntes=minutos_antes,
        )
    )
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False

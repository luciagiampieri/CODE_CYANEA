import asyncio
import logging
import os
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.db import session as session_module
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_viaje import EstadoViaje
from app.models.recordatorio_actividad_notificado import RecordatorioActividadNotificado
from app.models.tramo_traslado_viaje import TIPO_TRAMO_IDA, TramoTrasladoViaje
from app.models.viaje import Viaje
from app.services.notifications.dispatcher import TripNotificationEvent, dispatch_trip_notification
from app.services.notifications.service import NotificationType


logger = logging.getLogger(__name__)
_RECORDATORIO_INICIO_ACTIVIDAD = "inicio_actividad"


def activity_reminders_should_start() -> bool:
    return settings.activity_reminders_enabled and "PYTEST_CURRENT_TEST" not in os.environ


@dataclass
class RecordatorioPendiente:
    """Recordatorio ya registrado y listo para notificar, en datos planos."""

    id_actividad: int
    id_dia: int
    nombre: str
    inicio: datetime
    id_viaje: int
    titulo_viaje: str


def _reservar_recordatorios(
    db: Session,
    ahora: datetime,
    hasta: datetime,
    minutos_antes: int,
) -> list[RecordatorioPendiente]:
    """Busca las actividades por empezar y registra cada recordatorio (sin duplicar).

    Es sincrónica y corre en el threadpool, así las consultas no frenan el event loop.
    Devuelve datos planos para notificar después desde el event loop.
    """
    pendientes: list[RecordatorioPendiente] = []
    for actividad in _load_candidate_activities(db, ahora, hasta):
        inicio = datetime.combine(actividad.DiaCronograma.Fecha, actividad.HoraInicio)
        if inicio < ahora or inicio > hasta:
            continue
        if _was_activity_reminder_sent(db, actividad.IdActividad, minutos_antes):
            continue
        viaje = actividad.DiaCronograma.Viaje
        pendiente = RecordatorioPendiente(
            id_actividad=actividad.IdActividad,
            id_dia=actividad.IdDiaCronograma,
            nombre=actividad.Nombre,
            inicio=inicio,
            id_viaje=viaje.IdViaje,
            titulo_viaje=viaje.Titulo,
        )
        if not _mark_activity_reminder_sent(db, actividad.IdActividad, minutos_antes):
            continue
        pendientes.append(pendiente)
    return pendientes


async def scan_and_dispatch_activity_reminders(
    db: Session,
    now: datetime | None = None,
) -> int:
    ahora = now or datetime.now()
    minutos_antes = settings.activity_reminder_minutes_before
    hasta = ahora + timedelta(minutes=minutos_antes)
    # La sesión se usa en secuencia: primero en el threadpool y, cuando termina, en el
    # event loop para notificar. Nunca desde los dos a la vez.
    pendientes = await run_in_threadpool(
        _reservar_recordatorios, db, ahora, hasta, minutos_antes
    )
    enviadas = 0

    for pendiente in pendientes:
        minutos_restantes = max(0, round((pendiente.inicio - ahora).total_seconds() / 60))
        mensaje_tiempo = (
            "esta por empezar"
            if minutos_restantes == 0
            else f"empieza en {minutos_restantes} min"
        )
        # Los recordatorios del ciclo ya quedaron registrados: si falla uno, se sigue
        # con los demás para que no se pierdan.
        try:
            await dispatch_trip_notification(
                db,
                TripNotificationEvent(
                    notification_type=NotificationType.RECORDATORIO_ACTIVIDAD,
                    tipo="recordatorio_actividad",
                    titulo=f"Actividad proxima en {pendiente.titulo_viaje}",
                    mensaje=f"{pendiente.nombre} {mensaje_tiempo}.",
                    id_viaje=pendiente.id_viaje,
                    id_usuario_actor=None,
                    data={
                        "eventType": "activity_reminder",
                        "activityId": pendiente.id_actividad,
                        "dayId": pendiente.id_dia,
                        "startsAt": pendiente.inicio.isoformat(),
                        "minutesBefore": minutos_antes,
                    },
                ),
            )
        except Exception:
            logger.exception(
                "No se pudo notificar el recordatorio de la actividad %s",
                pendiente.id_actividad,
            )
            db.rollback()
            continue
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
            with session_module.SessionLocal() as db:
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
            .outerjoin(
                TramoTrasladoViaje,
                TramoTrasladoViaje.IdTramoTraslado == ActividadItinerario.IdTramoTraslado,
            )
            .options(
                selectinload(ActividadItinerario.DiaCronograma)
                .selectinload(DiaCronograma.Viaje)
            )
            .where(
                DiaCronograma.Fecha >= ahora.date(),
                DiaCronograma.Fecha <= hasta.date(),
                EstadoViaje.Nombre == "activo",
                # La hora de la ida es la de llegada: no hay salida para recordar.
                or_(
                    TramoTrasladoViaje.IdTramoTraslado.is_(None),
                    TramoTrasladoViaje.IdTipoTramoTraslado != TIPO_TRAMO_IDA,
                ),
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

import asyncio
import contextlib
import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import session as session_module
from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.sugerencia_actividad import EstadoSugerenciaActividad, SugerenciaActividad
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.limites_planes import validar_viajes_activos
from app.services.notifications.dispatcher import TripNotificationEvent, dispatch_trip_notification
from app.services.notifications.service import NotificationType
from app.services.websocket_manager import manager


logger = logging.getLogger(__name__)

ESTADO_ACTIVO = "activo"
ESTADO_FINALIZADO = "finalizado"

CAMBIO_FINALIZADO = "finalizado"
CAMBIO_REACTIVADO = "reactivado"

DEMORA_INICIAL_SEGUNDOS = 10


@dataclass(slots=True)
class _Estados:
    viaje_activo: int
    viaje_finalizado: int
    participacion_invitado: int
    participacion_vencida: int
    invitacion_pendiente: int | None
    invitacion_vencida: int | None
    sugerencia_pendiente: int | None
    sugerencia_descartada: int | None


@dataclass(slots=True)
class ResultadoFinalizacion:
    id_viaje: int
    invitaciones_vencidas: int = 0
    invitaciones_mail_vencidas: int = 0
    sugerencias_descartadas: int = 0


@dataclass(slots=True)
class ResultadoReactivacion:
    id_viaje: int
    invitaciones_restauradas: int = 0
    invitaciones_mail_restauradas: int = 0
    sugerencias_restauradas: int = 0


def _zona() -> timezone | ZoneInfo:
    try:
        return ZoneInfo(settings.trip_status_timezone)
    except ZoneInfoNotFoundError:
        logger.warning("Zona horaria %s no disponible; se usa UTC-3", settings.trip_status_timezone)
        return timezone(timedelta(hours=-3))


def ahora_local() -> datetime:
    return datetime.now(_zona())


def hoy_local() -> date:
    return ahora_local().date()


def segundos_hasta_proxima_medianoche(ahora: datetime | None = None) -> float:
    ahora = ahora or ahora_local()
    manana = datetime.combine(ahora.date() + timedelta(days=1), time.min, tzinfo=ahora.tzinfo)
    return max(1.0, (manana - ahora).total_seconds() + 1)


def _id_por_nombre(db: Session, modelo, columna_id, nombre: str) -> int | None:
    return db.scalar(select(columna_id).where(func.lower(modelo.Nombre) == nombre))


def _cargar_estados(db: Session) -> _Estados | None:
    estados = _Estados(
        viaje_activo=_id_por_nombre(db, EstadoViaje, EstadoViaje.IdEstadoViaje, ESTADO_ACTIVO),
        viaje_finalizado=_id_por_nombre(
            db, EstadoViaje, EstadoViaje.IdEstadoViaje, ESTADO_FINALIZADO
        ),
        participacion_invitado=_id_por_nombre(
            db, EstadoParticipacion, EstadoParticipacion.IdEstadoParticipacion, "invitado"
        ),
        participacion_vencida=_id_por_nombre(
            db, EstadoParticipacion, EstadoParticipacion.IdEstadoParticipacion, "vencida"
        ),
        invitacion_pendiente=_id_por_nombre(
            db, EstadoInvitacion, EstadoInvitacion.IdEstadoInvitacion, "pendiente"
        ),
        invitacion_vencida=_id_por_nombre(
            db, EstadoInvitacion, EstadoInvitacion.IdEstadoInvitacion, "vencida"
        ),
        sugerencia_pendiente=_id_por_nombre(
            db,
            EstadoSugerenciaActividad,
            EstadoSugerenciaActividad.IdEstadoSugerenciaActividad,
            "pendiente",
        ),
        sugerencia_descartada=_id_por_nombre(
            db,
            EstadoSugerenciaActividad,
            EstadoSugerenciaActividad.IdEstadoSugerenciaActividad,
            "descartada",
        ),
    )
    obligatorios = (
        estados.viaje_activo,
        estados.viaje_finalizado,
        estados.participacion_invitado,
        estados.participacion_vencida,
    )
    if any(valor is None for valor in obligatorios):
        logger.error(
            "Faltan estados maestros para actualizar el estado de los viajes "
            "(¿se corrió `alembic upgrade head`?)"
        )
        return None
    return estados


def _actualizar(db: Session, sentencia) -> int:
    return db.execute(sentencia.execution_options(synchronize_session=False)).rowcount or 0


def _finalizar(db: Session, id_viaje: int, hoy: date, estados: _Estados) -> ResultadoFinalizacion | None:
    cambio = _actualizar(
        db,
        update(Viaje)
        .where(
            Viaje.IdViaje == id_viaje,
            Viaje.IdEstadoViaje == estados.viaje_activo,
            Viaje.FechaFin < hoy,
        )
        .values(IdEstadoViaje=estados.viaje_finalizado, FechaActualizacion=func.now()),
    )
    if cambio != 1:
        return None

    resultado = ResultadoFinalizacion(id_viaje=id_viaje)
    resultado.invitaciones_vencidas = _actualizar(
        db,
        update(ParticipanteViaje)
        .where(
            ParticipanteViaje.IdViaje == id_viaje,
            ParticipanteViaje.IdEstadoParticipacion == estados.participacion_invitado,
        )
        .values(IdEstadoParticipacion=estados.participacion_vencida, VencidaPorFinViaje=True),
    )
    if estados.invitacion_pendiente is not None and estados.invitacion_vencida is not None:
        resultado.invitaciones_mail_vencidas = _actualizar(
            db,
            update(InvitacionViaje)
            .where(
                InvitacionViaje.IdViaje == id_viaje,
                InvitacionViaje.IdEstadoInvitacion == estados.invitacion_pendiente,
            )
            .values(IdEstadoInvitacion=estados.invitacion_vencida, VencidaPorFinViaje=True),
        )
    if estados.sugerencia_pendiente is not None and estados.sugerencia_descartada is not None:
        resultado.sugerencias_descartadas = _actualizar(
            db,
            update(SugerenciaActividad)
            .where(
                SugerenciaActividad.IdViaje == id_viaje,
                SugerenciaActividad.IdEstadoSugerenciaActividad == estados.sugerencia_pendiente,
            )
            .values(
                IdEstadoSugerenciaActividad=estados.sugerencia_descartada,
                DescartadaPorFinViaje=True,
            ),
        )
    return resultado


def _invitacion_mail_vencida_por_plazo(invitacion: InvitacionViaje) -> bool:
    vencimiento = invitacion.FechaVencimiento
    if vencimiento is None:
        return False
    ahora = datetime.now(timezone.utc) if vencimiento.tzinfo else datetime.now()
    return vencimiento <= ahora


def _validar_reactivacion(db: Session, id_viaje: int, hoy: date, estados: _Estados) -> None:
    fila = db.execute(
        select(Viaje.IdEstadoViaje, Viaje.FechaFin, Viaje.IdAdministrador).where(
            Viaje.IdViaje == id_viaje
        )
    ).first()
    if fila is None or fila.IdEstadoViaje != estados.viaje_finalizado:
        return
    if fila.FechaFin is None or fila.FechaFin < hoy:
        return
    administrador = db.get(Usuario, fila.IdAdministrador)
    if administrador is not None:
        validar_viajes_activos(db, administrador)


def _reactivar(db: Session, id_viaje: int, hoy: date, estados: _Estados) -> ResultadoReactivacion | None:
    cambio = _actualizar(
        db,
        update(Viaje)
        .where(
            Viaje.IdViaje == id_viaje,
            Viaje.IdEstadoViaje == estados.viaje_finalizado,
            Viaje.FechaFin >= hoy,
        )
        .values(IdEstadoViaje=estados.viaje_activo, FechaActualizacion=func.now()),
    )
    if cambio != 1:
        return None

    resultado = ResultadoReactivacion(id_viaje=id_viaje)
    resultado.invitaciones_restauradas = _actualizar(
        db,
        update(ParticipanteViaje)
        .where(
            ParticipanteViaje.IdViaje == id_viaje,
            ParticipanteViaje.VencidaPorFinViaje.is_(True),
            ParticipanteViaje.IdEstadoParticipacion == estados.participacion_vencida,
        )
        .values(IdEstadoParticipacion=estados.participacion_invitado, VencidaPorFinViaje=False),
    )

    if estados.invitacion_pendiente is not None and estados.invitacion_vencida is not None:
        marcadas = db.scalars(
            select(InvitacionViaje).where(
                InvitacionViaje.IdViaje == id_viaje,
                InvitacionViaje.VencidaPorFinViaje.is_(True),
            )
            .execution_options(populate_existing=True)
        ).all()
        for invitacion in marcadas:
            invitacion.VencidaPorFinViaje = False
            if (
                invitacion.IdEstadoInvitacion == estados.invitacion_vencida
                and not _invitacion_mail_vencida_por_plazo(invitacion)
            ):
                invitacion.IdEstadoInvitacion = estados.invitacion_pendiente
                resultado.invitaciones_mail_restauradas += 1
        db.flush()

    if estados.sugerencia_pendiente is not None and estados.sugerencia_descartada is not None:
        resultado.sugerencias_restauradas = _actualizar(
            db,
            update(SugerenciaActividad)
            .where(
                SugerenciaActividad.IdViaje == id_viaje,
                SugerenciaActividad.DescartadaPorFinViaje.is_(True),
                SugerenciaActividad.IdEstadoSugerenciaActividad == estados.sugerencia_descartada,
            )
            .values(
                IdEstadoSugerenciaActividad=estados.sugerencia_pendiente,
                DescartadaPorFinViaje=False,
            ),
        )
    return resultado


def recalcular_estado_viaje(db: Session, id_viaje: int, hoy: date | None = None) -> str | None:
    """Ajusta el estado del viaje a sus fechas actuales. No hace commit.

    Se usa cuando el administrador modifica las fechas. Devuelve
    CAMBIO_FINALIZADO, CAMBIO_REACTIVADO o None si no cambió nada. Si devuelve
    CAMBIO_FINALIZADO, después del commit hay que llamar a
    `notificar_viaje_finalizado`.
    """
    estados = _cargar_estados(db)
    if estados is None:
        return None
    hoy = hoy or hoy_local()

    db.flush()
    _validar_reactivacion(db, id_viaje, hoy, estados)
    cambio = None
    if _finalizar(db, id_viaje, hoy, estados) is not None:
        cambio = CAMBIO_FINALIZADO
    elif _reactivar(db, id_viaje, hoy, estados) is not None:
        cambio = CAMBIO_REACTIVADO
    if cambio is not None:
        db.expire_all()
        logger.info("Estado del viaje %s recalculado: %s", id_viaje, cambio)
    return cambio


async def notificar_viaje_finalizado(db: Session, id_viaje: int) -> None:
    """Avisa a los participantes que el viaje terminó y que revisen la liquidación."""
    viaje = db.get(Viaje, id_viaje)
    if viaje is None:
        return

    with contextlib.suppress(Exception):
        await manager.broadcast_to_trip(
            id_viaje,
            {
                "tipo": "trip_updated",
                "trip_id": id_viaje,
                "message": "El viaje finalizó.",
            },
        )

    await dispatch_trip_notification(
        db,
        TripNotificationEvent(
            notification_type=NotificationType.VIAJE_FINALIZADO,
            tipo="viaje_finalizado",
            titulo=f"Terminó {viaje.Titulo}"[:150],
            mensaje=(
                f"El viaje {viaje.Titulo} finalizó. Revisá la liquidación para saldar "
                "las deudas pendientes del grupo."
            ),
            id_viaje=id_viaje,
            id_usuario_actor=None,
            data={"eventType": "trip_finished"},
        ),
    )


async def actualizar_estados_viajes(db: Session, hoy: date | None = None) -> list[int]:
    """Finaliza los viajes activos cuya fecha de fin ya pasó y avisa a sus
    participantes. Devuelve los ids de los viajes que finalizó en esta corrida.
    """
    estados = _cargar_estados(db)
    if estados is None:
        return []
    hoy = hoy or hoy_local()

    candidatos = db.scalars(
        select(Viaje.IdViaje)
        .where(Viaje.IdEstadoViaje == estados.viaje_activo, Viaje.FechaFin < hoy)
        .order_by(Viaje.FechaFin, Viaje.IdViaje)
    ).all()

    finalizados: list[int] = []
    for id_viaje in candidatos:
        try:
            resultado = _finalizar(db, id_viaje, hoy, estados)
            if resultado is None:
                db.rollback()
                continue
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("No se pudo finalizar el viaje %s", id_viaje)
            continue

        finalizados.append(id_viaje)
        logger.info(
            "Viaje %s finalizado: %s invitaciones y %s invitaciones por mail vencidas, "
            "%s sugerencias descartadas",
            id_viaje,
            resultado.invitaciones_vencidas,
            resultado.invitaciones_mail_vencidas,
            resultado.sugerencias_descartadas,
        )
        try:
            await notificar_viaje_finalizado(db, id_viaje)
        except Exception:
            db.rollback()
            logger.exception("No se pudo notificar la finalización del viaje %s", id_viaje)

    return finalizados


async def _ciclo() -> None:
    db = session_module.SessionLocal()
    try:
        finalizados = await actualizar_estados_viajes(db)
        if finalizados:
            logger.info("Viajes finalizados automáticamente: %s", len(finalizados))
    finally:
        db.close()


async def _bucle() -> None:
    await asyncio.sleep(DEMORA_INICIAL_SEGUNDOS)
    while True:
        try:
            await _ciclo()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Error en la actualización automática de estados de viajes")
        await asyncio.sleep(segundos_hasta_proxima_medianoche())


def _scheduler_habilitado() -> bool:
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    return bool(settings.trip_status_update_enabled)


def start_estado_viajes_scheduler() -> asyncio.Task | None:
    if not _scheduler_habilitado():
        logger.info("Actualización automática de estados de viajes deshabilitada")
        return None
    return asyncio.create_task(_bucle(), name="estado_viajes")


async def stop_estado_viajes_scheduler(task: asyncio.Task | None) -> None:
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
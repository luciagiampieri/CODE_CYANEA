import asyncio
import logging
import os
from contextlib import suppress
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.plan import PLAN_GRATUITO, PLAN_PRO
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import limites_planes, notificaciones_suscripciones
from app.services.mail import get_mail_service
from app.services.pagos.mercadopago import ErrorPasarela, PasarelaNoConfigurada, get_cliente_pasarela
from app.services.suscripcion_pro import (
    ESTADO_ACTIVA,
    ESTADO_CANCELADA,
    ESTADO_PENDIENTE_PAGO,
    ESTADO_VENCIDA,
    PASARELA_CANCELADA,
    PASARELA_PAUSADA,
    _id_estado_suscripcion,
    _tiene_pago_aprobado,
)

logger = logging.getLogger(__name__)

DIAS_AVISO_PREVIO = 3
INTERVALO_SEGUNDOS = 60 * 60


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _numero(valor: float | int) -> str:
    return str(int(valor)) if float(valor).is_integer() else str(valor).replace(".", ",")


def _excede(uso: limites_planes.UsoLimite) -> bool:
    return not uso.ilimitado and uso.uso > uso.limite


def _con_estado(*nombres: str):
    return (
        select(SuscripcionUsuario)
        .join(
            EstadoSuscripcion,
            EstadoSuscripcion.IdEstadoSuscripcion == SuscripcionUsuario.IdEstadoSuscripcion,
        )
        .where(EstadoSuscripcion.Nombre.in_(nombres))
    )



async def avisar_finalizaciones_proximas(
    db: Session, mail_service, ahora: datetime | None = None
) -> int:
    """Avisa una vez por período que una suscripción cancelada está por terminar."""
    ahora = ahora or _ahora()
    condiciones = (
        SuscripcionUsuario.FechaFin > ahora,
        SuscripcionUsuario.FechaFin <= ahora + timedelta(days=DIAS_AVISO_PREVIO),
        SuscripcionUsuario.FechaAvisoFinalizacion.is_(None),
    )
    ids = db.scalars(
        _con_estado(ESTADO_CANCELADA)
        .where(*condiciones)
        .with_only_columns(SuscripcionUsuario.IdSuscripcionUsuario)
    ).all()

    enviados = 0
    for id_suscripcion in ids:
        suscripcion = db.scalar(
            _con_estado(ESTADO_CANCELADA)
            .where(SuscripcionUsuario.IdSuscripcionUsuario == id_suscripcion, *condiciones)
            .with_for_update(of=SuscripcionUsuario)
            .execution_options(populate_existing=True)
        )
        if suscripcion is None:
            db.rollback()
            continue
        suscripcion.FechaAvisoFinalizacion = ahora
        db.commit()
        usuario = db.get(Usuario, suscripcion.IdUsuario)
        await notificaciones_suscripciones.notificar_fin_proximo(
            db, usuario, suscripcion, mail_service
        )
        enviados += 1
    return enviados



def _tiene_otra_vigente(db: Session, suscripcion: SuscripcionUsuario, ahora: datetime) -> bool:
    return (
        db.scalar(
            select(SuscripcionUsuario.IdSuscripcionUsuario)
            .join(
                EstadoSuscripcion,
                EstadoSuscripcion.IdEstadoSuscripcion == SuscripcionUsuario.IdEstadoSuscripcion,
            )
            .where(
                SuscripcionUsuario.IdUsuario == suscripcion.IdUsuario,
                SuscripcionUsuario.IdSuscripcionUsuario != suscripcion.IdSuscripcionUsuario,
                or_(
                    EstadoSuscripcion.Nombre == ESTADO_ACTIVA,
                    and_(
                        EstadoSuscripcion.Nombre == ESTADO_CANCELADA,
                        SuscripcionUsuario.FechaFin > ahora,
                    ),
                    and_(
                        EstadoSuscripcion.Nombre == ESTADO_PENDIENTE_PAGO,
                        _tiene_pago_aprobado(),
                    ),
                ),
            )
            .limit(1)
        )
        is not None
    )


def _viajes_administrados(db: Session, usuario: Usuario) -> list[Viaje]:
    return list(
        db.scalars(
            select(Viaje)
            .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
            .where(
                Viaje.IdAdministrador == usuario.IdUsuario,
                EstadoViaje.Nombre.in_(limites_planes.ESTADOS_VIAJE_ACTIVOS),
            )
            .order_by(Viaje.FechaInicio, Viaje.IdViaje)
        ).all()
    )


async def _notificar_participantes(db: Session, viaje: Viaje, avisos: list[str]) -> None:
    ids = db.scalars(
        select(ParticipanteViaje.IdUsuario)
        .join(ParticipanteViaje.EstadoParticipacion)
        .where(
            ParticipanteViaje.IdViaje == viaje.IdViaje,
            EstadoParticipacion.Nombre == limites_planes.ESTADO_PARTICIPACION_CONTABLE,
            ParticipanteViaje.IdUsuario != viaje.IdAdministrador,
        )
    ).all()
    for id_usuario in ids:
        await notificaciones_suscripciones.notificar_viaje_a_gratuito(
            db, id_usuario, viaje, avisos
        )


async def _notificar_cambio_de_plan(db: Session, usuario: Usuario, mail_service) -> None:
    excesos: list[str] = []

    viajes_activos = limites_planes.uso_viajes_activos(db, usuario)
    if _excede(viajes_activos):
        excesos.append(
            f"Tenés {viajes_activos.uso} viajes activos y el plan gratuito permite "
            f"{viajes_activos.limite}. Se conservan todos, pero no vas a poder crear viajes "
            "nuevos hasta quedar dentro del límite."
        )

    for viaje in _viajes_administrados(db, usuario):
        avisos_viaje: list[str] = []
        participantes = limites_planes.uso_participantes(db, viaje)
        if _excede(participantes):
            excesos.append(
                f"{viaje.Titulo}: tiene {participantes.uso} participantes y el plan gratuito "
                f"permite {participantes.limite}. Se conservan todos, pero no se van a poder "
                "sumar participantes nuevos."
            )
            avisos_viaje.append(
                "El viaje supera el límite de participantes del plan gratuito: no se pueden "
                "sumar participantes nuevos."
            )
        almacenamiento = limites_planes.presentar(limites_planes.uso_almacenamiento(db, viaje))
        if not almacenamiento["ilimitado"] and almacenamiento["usoActual"] > almacenamiento["limite"]:
            excesos.append(
                f"{viaje.Titulo}: usa {_numero(almacenamiento['usoActual'])} MB y el plan "
                f"gratuito permite {_numero(almacenamiento['limite'])} MB. Los documentos se "
                "pueden ver y descargar, pero no se van a poder subir nuevos."
            )
            avisos_viaje.append(
                "El viaje supera el almacenamiento del plan gratuito: los documentos se pueden "
                "ver y descargar, pero no se pueden subir nuevos."
            )
        await _notificar_participantes(db, viaje, avisos_viaje)

    await notificaciones_suscripciones.notificar_vuelta_a_gratuito(
        db, usuario, excesos, mail_service
    )


async def finalizar_suscripciones(
    db: Session, mail_service, ahora: datetime | None = None
) -> int:
    """Pasa al plan gratuito a quienes terminaron su período cancelado o vencieron."""
    ahora = ahora or _ahora()
    condiciones = (
        SuscripcionUsuario.FechaFin <= ahora,
        SuscripcionUsuario.FechaFinalizacion.is_(None),
    )
    ids = db.scalars(
        _con_estado(ESTADO_CANCELADA, ESTADO_VENCIDA)
        .where(*condiciones)
        .with_only_columns(SuscripcionUsuario.IdSuscripcionUsuario)
        .order_by(SuscripcionUsuario.FechaFin)
    ).all()

    cambios = 0
    for id_suscripcion in ids:
        suscripcion = db.scalar(
            _con_estado(ESTADO_CANCELADA, ESTADO_VENCIDA)
            .where(SuscripcionUsuario.IdSuscripcionUsuario == id_suscripcion, *condiciones)
            .with_for_update(of=SuscripcionUsuario)
            .execution_options(populate_existing=True)
        )
        if suscripcion is None:
            db.rollback()
            continue
        usuario = db.scalar(
            select(Usuario)
            .where(Usuario.IdUsuario == suscripcion.IdUsuario)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        suscripcion.FechaFinalizacion = ahora
        vuelve_a_gratuito = usuario.IdPlan == PLAN_PRO and not _tiene_otra_vigente(
            db, suscripcion, ahora
        )
        if vuelve_a_gratuito:
            usuario.IdPlan = PLAN_GRATUITO
        db.commit()

        if vuelve_a_gratuito:
            try:
                await _notificar_cambio_de_plan(db, usuario, mail_service)
            except Exception:
                logger.exception(
                    "No se pudo notificar la vuelta al plan gratuito",
                    extra={"user_id": usuario.IdUsuario},
                )
                db.rollback()
            cambios += 1
    return cambios



async def cancelar_en_pasarela(db: Session, cliente, ahora: datetime | None = None) -> int:
    """La US 119 pausa la suscripción; al terminar el período se cancela del todo."""
    ahora = ahora or _ahora()
    suscripciones = db.scalars(
        _con_estado(ESTADO_CANCELADA).where(
            SuscripcionUsuario.FechaFin <= ahora,
            SuscripcionUsuario.EstadoPasarela == PASARELA_PAUSADA,
            SuscripcionUsuario.IdSuscripcionPasarela.is_not(None),
        )
    ).all()

    canceladas = 0
    for suscripcion in suscripciones:
        try:
            await cliente.cancelar_suscripcion(suscripcion.IdSuscripcionPasarela)
        except (PasarelaNoConfigurada, ErrorPasarela):
            logger.warning(
                "No se pudo cancelar la suscripción en Mercado Pago",
                exc_info=True,
                extra={"suscripcion": suscripcion.IdSuscripcionUsuario},
            )
            continue
        suscripcion.EstadoPasarela = PASARELA_CANCELADA
        db.commit()
        canceladas += 1
    return canceladas


async def vencer_pendientes_de_pago(db: Session, cliente, ahora: datetime | None = None) -> int:
    """US 117: una renovación que sigue sin cobrarse pasado el plazo queda vencida.

    Se cancela también en Mercado Pago para que no siga reintentando el cobro; si
    la pasarela no responde, la suscripción vence igual y queda registrado.
    """
    ahora = ahora or _ahora()
    limite = ahora - timedelta(days=settings.subscription_pending_payment_days)
    condiciones = (
        SuscripcionUsuario.FechaPendientePago.is_not(None),
        SuscripcionUsuario.FechaPendientePago <= limite,
    )
    ids = db.scalars(
        _con_estado(ESTADO_PENDIENTE_PAGO)
        .where(*condiciones)
        .with_only_columns(SuscripcionUsuario.IdSuscripcionUsuario)
        .order_by(SuscripcionUsuario.FechaPendientePago)
    ).all()

    vencidas = 0
    for id_suscripcion in ids:
        suscripcion = db.scalar(
            _con_estado(ESTADO_PENDIENTE_PAGO)
            .where(SuscripcionUsuario.IdSuscripcionUsuario == id_suscripcion, *condiciones)
            .with_for_update(of=SuscripcionUsuario)
            .execution_options(populate_existing=True)
        )
        if suscripcion is None:
            db.rollback()
            continue
        suscripcion.IdEstadoSuscripcion = _id_estado_suscripcion(db, ESTADO_VENCIDA)
        db.commit()
        vencidas += 1

        if not suscripcion.IdSuscripcionPasarela:
            continue
        try:
            await cliente.cancelar_suscripcion(suscripcion.IdSuscripcionPasarela)
        except (PasarelaNoConfigurada, ErrorPasarela):
            logger.warning(
                "No se pudo cancelar en Mercado Pago una suscripción vencida",
                exc_info=True,
                extra={"suscripcion": suscripcion.IdSuscripcionUsuario},
            )
            continue
        suscripcion.EstadoPasarela = PASARELA_CANCELADA
        db.commit()
    return vencidas


async def procesar_fin_suscripciones(
    db: Session, cliente, mail_service, ahora: datetime | None = None
) -> dict[str, int]:
    ahora = ahora or _ahora()
    return {
        # Primero vencen las impagas, así en la misma pasada vuelven al plan gratuito.
        "vencidasPorFaltaDePago": await vencer_pendientes_de_pago(db, cliente, ahora),
        "cambiosDePlan": await finalizar_suscripciones(db, mail_service, ahora),
        "canceladasEnPasarela": await cancelar_en_pasarela(db, cliente, ahora),
        "avisosPrevios": await avisar_finalizaciones_proximas(db, mail_service, ahora),
    }


def fin_suscripciones_should_start() -> bool:
    return "PYTEST_CURRENT_TEST" not in os.environ


def start_fin_suscripciones_scheduler() -> asyncio.Task | None:
    if not fin_suscripciones_should_start():
        return None
    return asyncio.create_task(_fin_suscripciones_loop())


async def stop_fin_suscripciones_scheduler(task: asyncio.Task | None) -> None:
    if task is None:
        return
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


async def _fin_suscripciones_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                resultado = await procesar_fin_suscripciones(
                    db, get_cliente_pasarela(), get_mail_service()
                )
                if any(resultado.values()):
                    logger.info("Fin de suscripciones procesado: %s", resultado)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("No se pudo procesar el fin de las suscripciones")

        await asyncio.sleep(INTERVALO_SEGUNDOS)
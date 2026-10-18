from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.db import session as session_module
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.lugar_interes import LugarInteres
from app.models.participante_viaje import ParticipanteViaje
from app.models.propuesta import Propuesta
from app.models.sugerencia_actividad import SugerenciaActividad
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.votacion import Votacion
from app.models.voto import Voto
from app.services import sugerencias_votacion
from app.services.notifications import (
    NotificationType,
    TripNotificationEvent,
    dispatch_user_notification,
)
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)

INTERVALO_SEGUNDOS = 60
DEMORA_INICIAL_SEGUNDOS = 5
DIAS_PLAZO_DESEMPATE = 5

RESOLUCION_INCORPORADA = "incorporada"
RESOLUCION_EMPATE = "empate"
RESOLUCION_SIN_VOTOS = "sin_votos"
RESOLUCION_DIA_INEXISTENTE = "dia_inexistente"
RESOLUCION_EMPATE_VENCIDO = "empate_vencido"

ESTADO_ACEPTADA = "aceptada"
ESTADO_DESCARTADA = "descartada"

_DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
_MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


@dataclass
class ResultadoResolucion:
    tipo: str
    id_votacion: int
    id_viaje: int
    id_creador: int
    titulo_votacion: str
    id_actividad: int | None = None
    id_dia: int | None = None
    fecha_dia: date | None = None
    nombre_actividad: str | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    superpuestas: list[str] = field(default_factory=list)
    empatadas: list[str] = field(default_factory=list)
    fecha_limite: datetime | None = None



def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(fecha: datetime) -> datetime:
    return fecha if fecha.tzinfo is not None else fecha.replace(tzinfo=timezone.utc)


def _hhmm(hora: time) -> str:
    return hora.strftime("%H:%M")


def _fecha_legible(fecha: date) -> str:
    return f"{_DIAS[fecha.weekday()]} {fecha.day} de {_MESES[fecha.month - 1]}"


def _enumerar(partes: list[str]) -> str:
    partes = [p for p in partes if p]
    if len(partes) <= 1:
        return "".join(partes)
    return f"{', '.join(partes[:-1])} y {partes[-1]}"


def _resultado_base(votacion: Votacion, tipo: str) -> ResultadoResolucion:
    return ResultadoResolucion(
        tipo=tipo,
        id_votacion=votacion.IdVotacion,
        id_viaje=votacion.IdViaje,
        id_creador=votacion.IdCreador,
        titulo_votacion=votacion.Titulo,
    )


def contar_votos(db: Session, votacion: Votacion) -> dict[int, int]:
    """Votos por propuesta. Solo cuenta propuestas de esta votación."""
    conteo = {p.IdPropuesta: 0 for p in votacion.Propuestas}
    filas = db.execute(
        select(Voto.IdPropuesta, func.count(Voto.IdVoto))
        .where(Voto.IdVotacion == votacion.IdVotacion)
        .group_by(Voto.IdPropuesta)
    ).all()
    for id_propuesta, total in filas:
        if id_propuesta in conteo:
            conteo[id_propuesta] = total
    return conteo


def propuestas_ganadoras(conteo: dict[int, int]) -> list[int]:
    """Propuestas con la mayor cantidad de votos. Vacío si nadie votó."""
    if not conteo:
        return []
    maximo = max(conteo.values())
    if maximo == 0:
        return []
    return [id_propuesta for id_propuesta, votos in conteo.items() if votos == maximo]


def _reclamar(
    db: Session, id_votacion: int, estado_previo: str | None, estado_nuevo: str, **valores
) -> bool:
    """UPDATE condicional: solo cambia el estado si la votación sigue en `estado_previo`."""
    condicion = (
        Votacion.EstadoResolucion.is_(None)
        if estado_previo is None
        else Votacion.EstadoResolucion == estado_previo
    )
    resultado = db.execute(
        update(Votacion)
        .where(Votacion.IdVotacion == id_votacion, condicion)
        .values(EstadoResolucion=estado_nuevo, FechaResolucion=_ahora(), **valores)
        .execution_options(synchronize_session=False)
    )
    return resultado.rowcount == 1


def _cambiar_estado_sugerencias(db: Session, ids: list[int], nombre_estado: str) -> None:
    if not ids:
        return
    estado = sugerencias_votacion.obtener_estado(db, nombre_estado)
    db.execute(
        update(SugerenciaActividad)
        .where(SugerenciaActividad.IdSugerenciaActividad.in_(ids))
        .values(IdEstadoSugerenciaActividad=estado.IdEstadoSugerenciaActividad)
        .execution_options(synchronize_session=False)
    )


def _nombre_propuesta(db: Session, propuesta: Propuesta) -> str:
    if propuesta.IdSugerenciaActividad:
        sugerencia = db.get(SugerenciaActividad, propuesta.IdSugerenciaActividad)
        if sugerencia is not None:
            return sugerencia.Nombre
    return propuesta.Texto


def obtener_o_crear_lugar(db: Session, sugerencia: SugerenciaActividad) -> LugarInteres | None:
    """Reutiliza el LugarInteres de Google si ya existe; si no, lo crea con los datos
    validados que guardó la sugerencia (US 87)."""
    crudo = (sugerencia.GooglePlaceId or "").strip()
    if not crudo:
        return None
    normalizado = crudo.replace("google:", "", 1)
    candidatos = {crudo, normalizado, f"google:{normalizado}"}

    lugar = db.scalar(
        select(LugarInteres).where(LugarInteres.GooglePlaceId.in_(candidatos)).limit(1)
    )
    if lugar is not None:
        return lugar

    lugar = LugarInteres(
        GooglePlaceId=crudo,
        Nombre=sugerencia.LugarNombre[:200],
        Direccion=sugerencia.LugarDireccion[:255],
        Lat=sugerencia.Lat,
        Lng=sugerencia.Lng,
        Categoria=None,
        MetadataJson={
            "source": "sugerencia_ia",
            "idSugerencia": sugerencia.IdSugerenciaActividad,
        },
    )
    db.add(lugar)
    db.flush()
    return lugar


def _resolver_dia_inexistente(
    db: Session, votacion: Votacion, estado_previo: str | None
) -> ResultadoResolucion | None:
    if not _reclamar(db, votacion.IdVotacion, estado_previo, RESOLUCION_DIA_INEXISTENTE):
        return None
    _cambiar_estado_sugerencias(
        db, sugerencias_votacion.ids_sugerencias_de(votacion), ESTADO_DESCARTADA
    )
    return _resultado_base(votacion, RESOLUCION_DIA_INEXISTENTE)


def _incorporar(
    db: Session, votacion: Votacion, propuesta: Propuesta, estado_previo: str | None
) -> ResultadoResolucion | None:
    """Crea la actividad de la propuesta ganadora. No hace commit."""
    sugerencia = (
        db.get(SugerenciaActividad, propuesta.IdSugerenciaActividad)
        if propuesta.IdSugerenciaActividad
        else None
    )
    dia = db.get(DiaCronograma, sugerencia.IdDiaCronograma) if sugerencia is not None else None
    if dia is None or dia.IdViaje != votacion.IdViaje:
        return _resolver_dia_inexistente(db, votacion, estado_previo)

    if not _reclamar(db, votacion.IdVotacion, estado_previo, RESOLUCION_INCORPORADA):
        return None

    lugar = obtener_o_crear_lugar(db, sugerencia)

    superpuestas = [
        actividad.Nombre
        for actividad in db.scalars(
            select(ActividadItinerario).where(
                ActividadItinerario.IdDiaCronograma == dia.IdDiaCronograma
            )
        ).all()
        if actividad.HoraInicio < sugerencia.HoraFin and sugerencia.HoraInicio < actividad.HoraFin
    ]

    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        IdLugarInteres=lugar.IdLugarInteres if lugar is not None else None,
        Nombre=sugerencia.Nombre[:150],
        Descripcion=sugerencia.Descripcion or None,
        HoraInicio=sugerencia.HoraInicio,
        HoraFin=sugerencia.HoraFin,
        Icono="location-dot",
        IdVotacionOrigen=votacion.IdVotacion,
    )
    db.add(actividad)
    db.flush() 

    ids = sugerencias_votacion.ids_sugerencias_de(votacion)
    _cambiar_estado_sugerencias(
        db, [i for i in ids if i != sugerencia.IdSugerenciaActividad], ESTADO_DESCARTADA
    )
    _cambiar_estado_sugerencias(db, [sugerencia.IdSugerenciaActividad], ESTADO_ACEPTADA)

    resultado = _resultado_base(votacion, RESOLUCION_INCORPORADA)
    resultado.id_actividad = actividad.IdActividad
    resultado.id_dia = dia.IdDiaCronograma
    resultado.fecha_dia = dia.Fecha
    resultado.nombre_actividad = actividad.Nombre
    resultado.hora_inicio = actividad.HoraInicio
    resultado.hora_fin = actividad.HoraFin
    resultado.superpuestas = superpuestas
    return resultado


def resolver_votacion(db: Session, id_votacion: int) -> ResultadoResolucion | None:
    """Resuelve una votación de sugerencias cerrada. No hace commit.

    Devuelve None si no corresponde procesarla (todavía abierta, ya resuelta, cancelada
    o reclamada por otro proceso)."""
    votacion = db.scalar(
        select(Votacion)
        .options(selectinload(Votacion.Propuestas))
        .where(
            Votacion.IdVotacion == id_votacion,
            Votacion.EsDeSugerencias.is_(True),
            Votacion.EstadoResolucion.is_(None),
            Votacion.FechaCancelacion.is_(None),
        )
    )
    if votacion is None or _aware(votacion.FechaCierre) > _ahora():
        return None

    dia = db.get(DiaCronograma, votacion.IdDiaCronograma) if votacion.IdDiaCronograma else None
    if dia is None:
        return _resolver_dia_inexistente(db, votacion, None)

    ganadoras = propuestas_ganadoras(contar_votos(db, votacion))

    if not ganadoras:
        if not _reclamar(db, votacion.IdVotacion, None, RESOLUCION_SIN_VOTOS):
            return None
        sugerencias_votacion.liberar_sugerencias(db, votacion)
        return _resultado_base(votacion, RESOLUCION_SIN_VOTOS)

    if len(ganadoras) > 1:
        limite = _ahora() + timedelta(days=DIAS_PLAZO_DESEMPATE)
        if not _reclamar(
            db, votacion.IdVotacion, None, RESOLUCION_EMPATE, FechaLimiteDesempate=limite
        ):
            return None
        por_id = {p.IdPropuesta: p for p in votacion.Propuestas}
        resultado = _resultado_base(votacion, RESOLUCION_EMPATE)
        resultado.empatadas = [_nombre_propuesta(db, por_id[i]) for i in ganadoras]
        resultado.fecha_limite = limite
        return resultado

    propuesta = next(p for p in votacion.Propuestas if p.IdPropuesta == ganadoras[0])
    return _incorporar(db, votacion, propuesta, None)


def resolver_desempate(
    db: Session, votacion: Votacion, id_propuesta: int, id_usuario: int
) -> ResultadoResolucion:
    """El creador elige una de las propuestas empatadas. No hace commit."""
    if votacion.IdCreador != id_usuario:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el creador de la votación puede elegir la propuesta ganadora.",
        )
    if not votacion.EsDeSugerencias:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo las votaciones de sugerencias se resuelven eligiendo una ganadora.",
        )
    if votacion.EstadoResolucion != RESOLUCION_EMPATE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta votación no está esperando que se elija una propuesta ganadora.",
        )
    limite = votacion.FechaLimiteDesempate
    if limite is not None and _aware(limite) <= _ahora():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Venció el plazo para elegir la propuesta ganadora.",
        )

    empatadas = propuestas_ganadoras(contar_votos(db, votacion))
    if id_propuesta not in empatadas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Elegí una de las propuestas empatadas.",
        )

    propuesta = next(p for p in votacion.Propuestas if p.IdPropuesta == id_propuesta)
    resultado = _incorporar(db, votacion, propuesta, RESOLUCION_EMPATE)
    if resultado is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La votación ya fue resuelta.",
        )
    return resultado


def descartar_empate_vencido(db: Session, id_votacion: int) -> ResultadoResolucion | None:
    """Pasado el plazo sin elección del creador, las sugerencias se descartan. No hace commit."""
    votacion = db.scalar(
        select(Votacion)
        .options(selectinload(Votacion.Propuestas))
        .where(
            Votacion.IdVotacion == id_votacion,
            Votacion.EstadoResolucion == RESOLUCION_EMPATE,
        )
    )
    if votacion is None:
        return None
    limite = votacion.FechaLimiteDesempate
    if limite is None or _aware(limite) > _ahora():
        return None
    if not _reclamar(db, votacion.IdVotacion, RESOLUCION_EMPATE, RESOLUCION_EMPATE_VENCIDO):
        return None
    _cambiar_estado_sugerencias(
        db, sugerencias_votacion.ids_sugerencias_de(votacion), ESTADO_DESCARTADA
    )
    return _resultado_base(votacion, RESOLUCION_EMPATE_VENCIDO)


def _participantes_aceptados(db: Session, id_viaje: int) -> list[Usuario]:
    return list(
        db.scalars(
            select(Usuario)
            .join(ParticipanteViaje, ParticipanteViaje.IdUsuario == Usuario.IdUsuario)
            .join(
                EstadoParticipacion,
                EstadoParticipacion.IdEstadoParticipacion == ParticipanteViaje.IdEstadoParticipacion,
            )
            .where(
                ParticipanteViaje.IdViaje == id_viaje,
                EstadoParticipacion.Nombre == "aceptado",
                Usuario.Activo.is_(True),
            )
        ).all()
    )


async def _avisar_tiempo_real(db: Session, r: ResultadoResolucion) -> None:
    await manager.broadcast(
        r.id_viaje, {"tipo": "votacion_actualizada", "idVotacion": r.id_votacion}
    )
    await manager.broadcast(r.id_viaje, {"tipo": "sugerencias_actualizadas"})

    if r.tipo != RESOLUCION_INCORPORADA:
        return

    from app.api.routes.trips import _build_actividad_read, _sincronizar_y_notificar_ruta

    actividad = db.get(ActividadItinerario, r.id_actividad)
    if actividad is not None:
        await manager.broadcast(
            r.id_viaje,
            {
                "tipo": "actividad_creada",
                "idDiaCronograma": r.id_dia,
                "actividad": _build_actividad_read(actividad).model_dump(by_alias=True),
            },
        )
    dia = db.get(DiaCronograma, r.id_dia)
    if dia is not None:
        await _sincronizar_y_notificar_ruta(db, dia, r.id_viaje)


async def _enviar_notificaciones(db: Session, r: ResultadoResolucion) -> None:
    viaje = db.get(Viaje, r.id_viaje)
    titulo_viaje = viaje.Titulo if viaje is not None else "tu viaje"
    creador = db.get(Usuario, r.id_creador)

    if r.tipo == RESOLUCION_INCORPORADA:
        mensaje = (
            f"El grupo eligió «{r.nombre_actividad}» en la votación «{r.titulo_votacion}». "
            f"Se agregó al itinerario el {_fecha_legible(r.fecha_dia)} "
            f"de {_hhmm(r.hora_inicio)} a {_hhmm(r.hora_fin)}."
        )
        if r.superpuestas:
            mensaje += (
                f" Atención: se superpone con {_enumerar(r.superpuestas)}. "
                "Revisá el itinerario."
            )
        await dispatch_user_notification(
            db,
            TripNotificationEvent(
                notification_type=NotificationType.NUEVA_ACTIVIDAD,
                tipo="actividad_incorporada_votacion",
                titulo=f"Nueva actividad en {titulo_viaje}"[:150],
                mensaje=mensaje,
                id_viaje=r.id_viaje,
                id_usuario_actor=r.id_creador,
                data={
                    "eventType": "voting_activity_added",
                    "votingId": r.id_votacion,
                    "dayId": r.id_dia,
                    "activityId": r.id_actividad,
                    "hasOverlap": bool(r.superpuestas),
                },
            ),
            _participantes_aceptados(db, r.id_viaje),
        )
        return

    if creador is None:
        return

    if r.tipo == RESOLUCION_EMPATE:
        limite_local = r.fecha_limite.astimezone() if r.fecha_limite else None
        plazo = (
            f" antes del {limite_local:%d/%m} a las {limite_local:%H:%M}"
            if limite_local
            else ""
        )
        titulo = "La votación terminó en empate"
        mensaje = (
            f"La votación «{r.titulo_votacion}» de {titulo_viaje} terminó en empate entre "
            f"{_enumerar(r.empatadas)}. Elegí cuál incorporar al itinerario{plazo}; "
            "si no, las sugerencias se descartan."
        )
        evento = "voting_tie"
    elif r.tipo == RESOLUCION_DIA_INEXISTENTE:
        titulo = "No se pudo incorporar la actividad"
        mensaje = (
            f"La votación «{r.titulo_votacion}» de {titulo_viaje} cerró, pero el día del "
            "cronograma ya no existe porque cambiaron las fechas del viaje. "
            "No se agregó ninguna actividad y las sugerencias se descartaron."
        )
        evento = "voting_day_missing"
    elif r.tipo == RESOLUCION_EMPATE_VENCIDO:
        titulo = "Venció el plazo para desempatar"
        mensaje = (
            f"No se eligió una ganadora para «{r.titulo_votacion}» a tiempo, "
            "así que las sugerencias se descartaron."
        )
        evento = "voting_tie_expired"
    else:
        return 

    await dispatch_user_notification(
        db,
        TripNotificationEvent(
            notification_type=NotificationType.NUEVA_VOTACION,
            tipo=f"votacion_{r.tipo}",
            titulo=titulo,
            mensaje=mensaje,
            id_viaje=r.id_viaje,
            id_usuario_actor=r.id_creador,
            data={"eventType": evento, "votingId": r.id_votacion},
        ),
        [creador],
    )


async def notificar_resultado(db: Session, resultado: ResultadoResolucion) -> None:
    try:
        await _avisar_tiempo_real(db, resultado)
    except Exception:
        logger.exception(
            "No se pudo avisar en tiempo real la resolución de la votación %s",
            resultado.id_votacion,
        )
    try:
        await _enviar_notificaciones(db, resultado)
    except Exception:
        logger.exception(
            "No se pudieron enviar las notificaciones de la votación %s", resultado.id_votacion
        )



async def _procesar_una(db: Session, id_votacion: int, resolver) -> int:
    try:
        resultado = resolver(db, id_votacion)
        if resultado is None:
            db.rollback()
            return 0
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.info("La votación %s ya había generado su actividad: se omite", id_votacion)
        return 0
    except Exception:
        db.rollback()
        logger.exception("Error resolviendo la votación %s", id_votacion)
        return 0

    logger.info("Votación %s resuelta: %s", id_votacion, resultado.tipo)
    await notificar_resultado(db, resultado)
    return 1


def _completar_marca_sugerencias(db: Session) -> None:
    try:
        filas = db.execute(
            select(Votacion.IdVotacion, func.min(SugerenciaActividad.IdDiaCronograma))
            .join(Propuesta, Propuesta.IdVotacion == Votacion.IdVotacion)
            .join(
                SugerenciaActividad,
                SugerenciaActividad.IdSugerenciaActividad == Propuesta.IdSugerenciaActividad,
            )
            .where(Votacion.EsDeSugerencias.is_(False))
            .group_by(Votacion.IdVotacion)
        ).all()
        for id_votacion, id_dia in filas:
            db.execute(
                update(Votacion)
                .where(Votacion.IdVotacion == id_votacion)
                .values(EsDeSugerencias=True, IdDiaCronograma=id_dia)
                .execution_options(synchronize_session=False)
            )
        if filas:
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("No se pudo completar la marca de votaciones de sugerencias")


async def procesar_pendientes(db: Session) -> int:
    """Resuelve las votaciones cerradas y los empates vencidos. Devuelve cuántas procesó."""
    _completar_marca_sugerencias(db)
    ahora = _ahora()

    cerradas = [
        id_votacion
        for id_votacion, cierre in db.execute(
            select(Votacion.IdVotacion, Votacion.FechaCierre)
            .where(
                Votacion.EsDeSugerencias.is_(True),
                Votacion.EstadoResolucion.is_(None),
                Votacion.FechaCancelacion.is_(None),
            )
            .order_by(Votacion.FechaCierre)
        ).all()
        if _aware(cierre) <= ahora
    ]
    vencidas = [
        id_votacion
        for id_votacion, limite in db.execute(
            select(Votacion.IdVotacion, Votacion.FechaLimiteDesempate).where(
                Votacion.EsDeSugerencias.is_(True),
                Votacion.EstadoResolucion == RESOLUCION_EMPATE,
            )
        ).all()
        if limite is not None and _aware(limite) <= ahora
    ]

    procesadas = 0
    for id_votacion in cerradas:
        procesadas += await _procesar_una(db, id_votacion, resolver_votacion)
    for id_votacion in vencidas:
        procesadas += await _procesar_una(db, id_votacion, descartar_empate_vencido)
    return procesadas


async def _ciclo() -> None:
    db = session_module.SessionLocal()
    try:
        await procesar_pendientes(db)
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
            logger.exception("Error en el ciclo de resolución de votaciones")
        await asyncio.sleep(INTERVALO_SEGUNDOS)


def _scheduler_habilitado() -> bool:
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    return bool(getattr(settings, "votaciones_resolucion_habilitada", True))


def start_resolucion_votaciones_scheduler() -> asyncio.Task | None:
    if not _scheduler_habilitado():
        logger.info("Resolución automática de votaciones deshabilitada")
        return None
    return asyncio.create_task(_bucle(), name="resolucion_votaciones")


async def stop_resolucion_votaciones_scheduler(task: asyncio.Task | None) -> None:
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
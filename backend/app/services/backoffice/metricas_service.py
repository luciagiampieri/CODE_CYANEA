import logging
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.estado_viaje import EstadoViaje
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.solicitud_ia import SolicitudIA
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.schemas.backoffice_metricas import (
    MetricaDashboard,
    MetricasDashboard,
    PuntoEvolucion,
    SerieEvolucion,
)

logger = logging.getLogger(__name__)

ZONA_AR = timezone(timedelta(hours=-3), "America/Argentina/Buenos_Aires")

DIAS_POR_DEFECTO = 30
DIAS_MAXIMOS = 366
DIAS_ACTIVIDAD = 30
MAX_DIAS_AGRUPACION_DIARIA = 62
ESTADO_VIAJE_ACTIVO = "activo"

MENSAJE_ERROR_METRICA = "No se pudo obtener esta métrica."
MENSAJE_ERROR_EVOLUCION = "No se pudo obtener la evolución del período."
MENSAJE_SIN_SUSCRIPCIONES = "Disponible cuando se implementen las suscripciones Pro."


class RangoInvalido(ValueError):
    pass


class MetricaNoDisponible(Exception):
    pass


def hoy_ar() -> date:
    return datetime.now(ZONA_AR).date()


def resolver_rango(desde: date | None, hasta: date | None) -> tuple[date, date]:
    hoy = hoy_ar()
    hasta = hasta or hoy
    desde = desde or hasta - timedelta(days=DIAS_POR_DEFECTO - 1)

    if hasta > hoy:
        raise RangoInvalido("La fecha de fin no puede ser posterior a hoy.")
    if hasta < desde:
        raise RangoInvalido("La fecha de fin no puede ser anterior a la fecha de inicio.")
    if (hasta - desde).days + 1 > DIAS_MAXIMOS:
        raise RangoInvalido("El rango no puede superar un año.")
    return desde, hasta


def _limites_utc(desde: date, hasta: date) -> tuple[datetime, datetime]:
    inicio = datetime.combine(desde, time.min, tzinfo=ZONA_AR)
    fin = datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=ZONA_AR)
    return inicio.astimezone(timezone.utc), fin.astimezone(timezone.utc)


def _usuarios_vigentes():
    return (
        Usuario.IdRolSistema.is_distinct_from(ROL_ADMIN_SISTEMA),
        Usuario.FechaBaja.is_(None),
    )


def _usuarios_registrados(db: Session, inicio: datetime, fin: datetime) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Usuario)
        .where(*_usuarios_vigentes(), Usuario.FechaAlta < fin)
    ) or 0


def _usuarios_activos(db: Session, inicio: datetime, fin: datetime) -> int:
    limite = datetime.now(timezone.utc) - timedelta(days=DIAS_ACTIVIDAD)
    return db.scalar(
        select(func.count())
        .select_from(Usuario)
        .where(*_usuarios_vigentes(), Usuario.UltimoAcceso >= limite)
    ) or 0


def _viajes_creados(db: Session, inicio: datetime, fin: datetime) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Viaje)
        .where(Viaje.FechaCreacion >= inicio, Viaje.FechaCreacion < fin)
    ) or 0


def _viajes_activos(db: Session, inicio: datetime, fin: datetime) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Viaje)
        .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
        .where(EstadoViaje.Nombre == ESTADO_VIAJE_ACTIVO)
    ) or 0


def _suscripciones_pro_activas(db: Session, inicio: datetime, fin: datetime) -> int:
    raise MetricaNoDisponible(MENSAJE_SIN_SUSCRIPCIONES)


def _ingresos(db: Session, inicio: datetime, fin: datetime) -> float:
    raise MetricaNoDisponible(MENSAJE_SIN_SUSCRIPCIONES)


def _solicitudes_ia(db: Session, inicio: datetime, fin: datetime) -> int:
    return db.scalar(
        select(func.count())
        .select_from(SolicitudIA)
        .where(SolicitudIA.Fecha >= inicio, SolicitudIA.Fecha < fin)
    ) or 0


def _calcular(db: Session, nombre: str, funcion, inicio: datetime, fin: datetime) -> MetricaDashboard:
    try:
        return MetricaDashboard(valor=funcion(db, inicio, fin))
    except MetricaNoDisponible as aviso:
        return MetricaDashboard(error=str(aviso))
    except Exception:
        logger.exception("Error al calcular la métrica %s", nombre)
        db.rollback()
        return MetricaDashboard(error=MENSAJE_ERROR_METRICA)


def _a_fecha_ar(valor: datetime) -> date:
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(ZONA_AR).date()


def _agrupacion(desde: date, hasta: date) -> str:
    return "dia" if (hasta - desde).days + 1 <= MAX_DIAS_AGRUPACION_DIARIA else "mes"


def _clave(fecha: date, agrupacion: str) -> date:
    return fecha if agrupacion == "dia" else fecha.replace(day=1)


def _claves_del_rango(desde: date, hasta: date, agrupacion: str) -> list[date]:
    claves = []
    actual = _clave(desde, agrupacion)
    while actual <= hasta:
        claves.append(actual)
        if agrupacion == "dia":
            actual += timedelta(days=1)
        else:
            actual = (actual.replace(day=28) + timedelta(days=4)).replace(day=1)
    return claves


def _evolucion(db: Session, desde: date, hasta: date, inicio: datetime, fin: datetime) -> SerieEvolucion:
    try:
        agrupacion = _agrupacion(desde, hasta)
        altas = db.scalars(
            select(Usuario.FechaAlta).where(
                *_usuarios_vigentes(), Usuario.FechaAlta >= inicio, Usuario.FechaAlta < fin
            )
        ).all()
        creaciones = db.scalars(
            select(Viaje.FechaCreacion).where(
                Viaje.FechaCreacion >= inicio, Viaje.FechaCreacion < fin
            )
        ).all()

        usuarios = Counter(_clave(_a_fecha_ar(f), agrupacion) for f in altas)
        viajes = Counter(_clave(_a_fecha_ar(f), agrupacion) for f in creaciones)

        return SerieEvolucion(
            agrupacion=agrupacion,
            puntos=[
                PuntoEvolucion(fecha=clave, usuarios=usuarios[clave], viajes=viajes[clave])
                for clave in _claves_del_rango(desde, hasta, agrupacion)
            ],
        )
    except Exception:
        logger.exception("Error al calcular la evolución del dashboard")
        db.rollback()
        return SerieEvolucion(error=MENSAJE_ERROR_EVOLUCION)


def obtener_metricas(db: Session, desde: date, hasta: date) -> MetricasDashboard:
    inicio, fin = _limites_utc(desde, hasta)
    calculos = {
        "usuariosRegistrados": _usuarios_registrados,
        "usuariosActivos": _usuarios_activos,
        "viajesCreados": _viajes_creados,
        "viajesActivos": _viajes_activos,
        "suscripcionesProActivas": _suscripciones_pro_activas,
        "ingresos": _ingresos,
        "solicitudesIA": _solicitudes_ia,
    }
    metricas = {
        nombre: _calcular(db, nombre, funcion, inicio, fin)
        for nombre, funcion in calculos.items()
    }
    return MetricasDashboard(
        desde=desde,
        hasta=hasta,
        evolucion=_evolucion(db, desde, hasta, inicio, fin),
        **metricas,
    )
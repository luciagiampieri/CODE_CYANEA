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
    Estacionalidad,
    FilaEstacional,
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


ANIOS_FUTUROS_SALIDAS = 1

METRICAS_COMPARABLES = {"usuariosRegistrados", "viajesCreados", "solicitudesIA"}

MENSAJE_ERROR_METRICA = "No se pudo obtener esta métrica."
MENSAJE_ERROR_EVOLUCION = "No se pudo obtener la evolución del período."
MENSAJE_ERROR_ESTACIONALIDAD = "No se pudo obtener la estacionalidad."
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


def _a_fecha_ar(valor: datetime) -> date:
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(ZONA_AR).date()


def _a_fecha(valor: date | datetime) -> date:
    return _a_fecha_ar(valor) if isinstance(valor, datetime) else valor


def _usuarios_vigentes():
    return (
        Usuario.IdRolSistema.is_distinct_from(ROL_ADMIN_SISTEMA),
        Usuario.FechaBaja.is_(None),
    )


def fecha_inicio_plataforma(db: Session) -> date | None:
    primera = db.scalar(select(func.min(Usuario.FechaAlta)).where(*_usuarios_vigentes()))
    return _a_fecha_ar(primera) if primera else None


def rango_historico(db: Session) -> tuple[date, date]:
    """Desde el primer registro de un usuario hasta hoy ("Desde el inicio")."""
    hoy = hoy_ar()
    inicio = fecha_inicio_plataforma(db) or hoy
    return min(inicio, hoy), hoy


def rango_anterior(desde: date, hasta: date) -> tuple[date, date]:
    """Período inmediatamente anterior, de la misma cantidad de días."""
    dias = (hasta - desde).days + 1
    return desde - timedelta(days=dias), desde - timedelta(days=1)


def limites_utc(desde: date, hasta: date) -> tuple[datetime, datetime]:
    inicio = datetime.combine(desde, time.min, tzinfo=ZONA_AR)
    fin = datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=ZONA_AR)
    return inicio.astimezone(timezone.utc), fin.astimezone(timezone.utc)


_limites_utc = limites_utc


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


def _calcular(
    db: Session,
    nombre: str,
    funcion,
    inicio: datetime,
    fin: datetime,
    limites_anteriores: tuple[datetime, datetime] | None = None,
) -> MetricaDashboard:
    try:
        valor = funcion(db, inicio, fin)
        anterior = funcion(db, *limites_anteriores) if limites_anteriores else None
        return MetricaDashboard(valor=valor, anterior=anterior)
    except MetricaNoDisponible as aviso:
        return MetricaDashboard(error=str(aviso))
    except Exception:
        logger.exception("Error al calcular la métrica %s", nombre)
        db.rollback()
        return MetricaDashboard(error=MENSAJE_ERROR_METRICA)


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
        pedidos_ia = db.scalars(
            select(SolicitudIA.Fecha).where(SolicitudIA.Fecha >= inicio, SolicitudIA.Fecha < fin)
        ).all()

        usuarios = Counter(_clave(_a_fecha_ar(f), agrupacion) for f in altas)
        viajes = Counter(_clave(_a_fecha_ar(f), agrupacion) for f in creaciones)
        solicitudes = Counter(_clave(_a_fecha_ar(f), agrupacion) for f in pedidos_ia)

        return SerieEvolucion(
            agrupacion=agrupacion,
            puntos=[
                PuntoEvolucion(
                    fecha=clave,
                    usuarios=usuarios[clave],
                    viajes=viajes[clave],
                    solicitudesIA=solicitudes[clave],
                )
                for clave in _claves_del_rango(desde, hasta, agrupacion)
            ],
        )
    except Exception:
        logger.exception("Error al calcular la evolución del dashboard")
        db.rollback()
        return SerieEvolucion(error=MENSAJE_ERROR_EVOLUCION)


def _filas_estacionales(fechas: list[date], hasta_anio: int | None = None) -> list[FilaEstacional]:
    if hasta_anio is not None:
        fechas = [fecha for fecha in fechas if fecha.year <= hasta_anio]
    if not fechas:
        return []
    conteo = Counter((fecha.year, fecha.month) for fecha in fechas)
    primero = min(fecha.year for fecha in fechas)
    ultimo = max(fecha.year for fecha in fechas)
    return [
        FilaEstacional(anio=anio, meses=[conteo[(anio, mes)] for mes in range(1, 13)])
        for anio in range(primero, ultimo + 1)
    ]


def _estacionalidad(db: Session) -> Estacionalidad:
    """Toda la historia mes por mes, sin importar el rango elegido."""
    try:
        anio_actual = hoy_ar().year
        altas = db.scalars(
            select(Usuario.FechaAlta).where(*_usuarios_vigentes(), Usuario.FechaAlta.is_not(None))
        ).all()
        creaciones = db.scalars(
            select(Viaje.FechaCreacion).where(Viaje.FechaCreacion.is_not(None))
        ).all()
        salidas = db.scalars(select(Viaje.FechaInicio).where(Viaje.FechaInicio.is_not(None))).all()
        return Estacionalidad(
            usuarios=_filas_estacionales([_a_fecha(f) for f in altas], anio_actual),
            viajes=_filas_estacionales([_a_fecha(f) for f in creaciones], anio_actual),
            salidas=_filas_estacionales(
                [_a_fecha(f) for f in salidas], anio_actual + ANIOS_FUTUROS_SALIDAS
            ),
        )
    except Exception:
        logger.exception("Error al calcular la estacionalidad del dashboard")
        db.rollback()
        return Estacionalidad(error=MENSAJE_ERROR_ESTACIONALIDAD)


def obtener_metricas(
    db: Session, desde: date, hasta: date, historico: bool = False
) -> MetricasDashboard:
    inicio, fin = limites_utc(desde, hasta)
    anterior = None if historico else rango_anterior(desde, hasta)
    limites_anteriores = limites_utc(*anterior) if anterior else None

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
        nombre: _calcular(
            db,
            nombre,
            funcion,
            inicio,
            fin,
            limites_anteriores if nombre in METRICAS_COMPARABLES else None,
        )
        for nombre, funcion in calculos.items()
    }
    return MetricasDashboard(
        desde=desde,
        hasta=hasta,
        historico=historico,
        desdeAnterior=anterior[0] if anterior else None,
        hastaAnterior=anterior[1] if anterior else None,
        evolucion=_evolucion(db, desde, hasta, inicio, fin),
        estacionalidad=_estacionalidad(db),
        **metricas,
    )
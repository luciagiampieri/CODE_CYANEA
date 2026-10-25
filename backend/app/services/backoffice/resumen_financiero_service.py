"""Cobros por fecha de pago; no devengamiento ni balance contable."""

from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.services.backoffice.metricas_service import ZONA_AR


def _limites(desde, hasta):
    return (
        datetime.combine(desde, time.min, tzinfo=ZONA_AR).astimezone(timezone.utc),
        datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=ZONA_AR).astimezone(
            timezone.utc
        ),
    )


def resumen(db, *, desde=None, hasta=None, ahora=None):
    ahora = ahora or datetime.now(timezone.utc)
    hoy = ahora.astimezone(ZONA_AR).date()
    hasta = hasta or hoy
    if hasta.year < 2 or (desde and desde.year < 2):
        raise HTTPException(422, "Selecciona un periodo desde el segundo ano calendario.")
    indice = hasta.year * 12 + hasta.month - 1 - 11
    anio, mes = divmod(indice, 12)
    desde = desde or date(anio, mes + 1, 1)
    if hasta > hoy or desde > hasta or (hasta - desde).days >= 366:
        raise HTTPException(
            422,
            "Selecciona un periodo de hasta 366 dias, sin fechas futuras.",
            headers={"X-Error-Code": "FINANCIAL_DATE_RANGE_INVALID"},
        )
    cantidad_dias = (hasta - desde).days + 1
    if desde.toordinal() <= cantidad_dias:
        raise HTTPException(422, "El periodo no permite calcular una comparacion anterior.")
    anterior_hasta = desde - timedelta(days=1)
    anterior_desde = desde - timedelta(days=cantidad_dias)
    inicio, fin = _limites(desde, hasta)
    previo_inicio, _ = _limites(anterior_desde, anterior_hasta)
    fecha = PagoSuscripcion.FechaPago
    if db.bind.dialect.name == "postgresql":
        periodo = func.to_char(func.timezone("America/Argentina/Buenos_Aires", fecha), "YYYY-MM")
    else:
        periodo = func.strftime("%Y-%m", fecha, "-3 hours")
    filas = db.execute(
        select(
            periodo,
            EstadoPagoSuscripcion.Nombre,
            SuscripcionUsuario.MesesPeriodo,
            func.count(),
            func.sum(PagoSuscripcion.MontoARS),
        )
        .join(
            EstadoPagoSuscripcion,
            EstadoPagoSuscripcion.IdEstadoPagoSuscripcion
            == PagoSuscripcion.IdEstadoPagoSuscripcion,
        )
        .join(
            SuscripcionUsuario,
            SuscripcionUsuario.IdSuscripcionUsuario == PagoSuscripcion.IdSuscripcionUsuario,
        )
        .where(fecha >= inicio, fecha < fin)
        .group_by(periodo, EstadoPagoSuscripcion.Nombre, SuscripcionUsuario.MesesPeriodo)
    )
    meses = {}
    cursor = desde.replace(day=1)
    while cursor <= hasta:
        clave = cursor.strftime("%Y-%m")
        meses[clave] = dict(
            periodo=clave,
            desde=max(desde, cursor),
            hasta=min(hasta, cursor.replace(day=monthrange(cursor.year, cursor.month)[1])),
            ingresosARS=Decimal(0),
            mensualARS=Decimal(0),
            anualARS=Decimal(0),
            sinPeriodicidadARS=Decimal(0),
            aprobados=0,
            pendientesARS=Decimal(0),
            pendientes=0,
            rechazados=0,
        )
        cursor = (cursor + timedelta(days=32)).replace(day=1)
    for clave, estado, periodicidad, cantidad, monto in filas:
        fila = meses[clave]
        if estado == "aprobado":
            fila["ingresosARS"] += monto
            fila[{1: "mensualARS", 12: "anualARS"}.get(periodicidad, "sinPeriodicidadARS")] += monto
            fila["aprobados"] += cantidad
        elif estado == "pendiente":
            fila["pendientesARS"] += monto
            fila["pendientes"] += cantidad
        elif estado == "rechazado":
            fila["rechazados"] += cantidad
    periodos = list(meses.values())
    ingresos = sum((p["ingresosARS"] for p in periodos), Decimal(0))
    anteriores = db.scalar(
        select(func.coalesce(func.sum(PagoSuscripcion.MontoARS), 0))
        .join(
            EstadoPagoSuscripcion,
            EstadoPagoSuscripcion.IdEstadoPagoSuscripcion
            == PagoSuscripcion.IdEstadoPagoSuscripcion,
        )
        .where(fecha >= previo_inicio, fecha < inicio, EstadoPagoSuscripcion.Nombre == "aprobado")
    ) or Decimal(0)
    aprobados, pendientes, rechazados = (
        sum(p[k] for p in periodos) for k in ["aprobados", "pendientes", "rechazados"]
    )
    total = aprobados + pendientes + rechazados
    activas = (
        db.scalar(
            select(func.count(func.distinct(SuscripcionUsuario.IdUsuario)))
            .join(
                EstadoSuscripcion,
                EstadoSuscripcion.IdEstadoSuscripcion == SuscripcionUsuario.IdEstadoSuscripcion,
            )
            .where(
                EstadoSuscripcion.Nombre == "activa",
                SuscripcionUsuario.FechaInicio <= ahora,
                SuscripcionUsuario.FechaFin > ahora,
            )
        )
        or 0
    )
    return dict(
        desde=desde,
        hasta=hasta,
        anteriorDesde=anterior_desde,
        anteriorHasta=anterior_hasta,
        ingresosARS=ingresos,
        ingresosAnterioresARS=anteriores,
        variacionPorcentaje=((ingresos - anteriores) * 100 / anteriores).quantize(Decimal("0.01"))
        if anteriores
        else None,
        pagosAprobados=aprobados,
        pagosPendientes=pendientes,
        pagosRechazados=rechazados,
        pendientesARS=sum((p["pendientesARS"] for p in periodos), Decimal(0)),
        tasaAprobacion=(Decimal(aprobados) * 100 / total).quantize(Decimal("0.01"))
        if total
        else Decimal(0),
        suscripcionesActivasHoy=activas,
        periodos=periodos,
    )

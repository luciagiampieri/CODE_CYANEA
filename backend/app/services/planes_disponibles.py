"""Consulta vigente de planes para viajeros; no inicia cobros ni cambia planes."""

from decimal import Decimal

from sqlalchemy import select

from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.plan import Plan
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.services.backoffice.planes_service import obtener


def consultar(db, usuario):
    configuracion = obtener(db)
    mensual, anual = configuracion["precioMensualARS"], configuracion["precioAnualARS"]
    ahorro = None
    if mensual is not None and anual is not None and mensual > 0:
        ahorro = max(Decimal(0), (1 - anual / (mensual * 12)) * 100).quantize(Decimal("0.01"))
    fila = db.execute(
        select(SuscripcionUsuario, EstadoSuscripcion.Nombre)
        .join(
            EstadoSuscripcion,
            EstadoSuscripcion.IdEstadoSuscripcion == SuscripcionUsuario.IdEstadoSuscripcion,
        )
        .where(SuscripcionUsuario.IdUsuario == usuario.IdUsuario)
        .order_by(
            SuscripcionUsuario.FechaInicio.desc(), SuscripcionUsuario.IdSuscripcionUsuario.desc()
        )
        .limit(1)
    ).first()
    ultima = None
    if fila:
        suscripcion, estado = fila
        ultima = dict(
            id=suscripcion.IdSuscripcionUsuario,
            tipoPlan={1: "mensual", 12: "anual"}.get(suscripcion.MesesPeriodo),
            estado=estado,
            fechaInicio=suscripcion.FechaInicio,
            fechaFin=suscripcion.FechaFin,
            fechaCancelacion=suscripcion.FechaCancelacion,
            precioPeriodoARS=suscripcion.PrecioPeriodoARS,
        )
    return {
        **configuracion,
        "planActual": db.get(Plan, usuario.IdPlan).Nombre,
        "ahorroAnualPorcentaje": ahorro,
        "ultimaSuscripcion": ultima,
    }

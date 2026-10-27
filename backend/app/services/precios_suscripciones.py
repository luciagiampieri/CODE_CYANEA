"""Crea períodos con tarifa congelada; no procesa pagos ni renueva automáticamente."""

import calendar
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.plan import PLAN_PRO, Plan
from app.models.suscripcion_usuario import SuscripcionUsuario


def sumar_meses(inicio: datetime, meses: int) -> datetime:
    """Mismo día del mes siguiente (o del año siguiente); si no existe, el último día."""
    mes = inicio.year * 12 + inicio.month - 1 + meses
    anio, indice_mes = divmod(mes, 12)
    return inicio.replace(
        year=anio,
        month=indice_mes + 1,
        day=min(inicio.day, calendar.monthrange(anio, indice_mes + 1)[1]),
    )


def fecha_limite_pago(suscripcion: SuscripcionUsuario) -> datetime | None:
    """Hasta cuándo una renovación rechazada puede seguir en "pendiente_pago" (US 117)."""
    inicio = suscripcion.FechaPendientePago
    if inicio is None:
        return None
    if inicio.tzinfo is None:
        inicio = inicio.replace(tzinfo=timezone.utc)
    return inicio + timedelta(days=settings.subscription_pending_payment_days)


def crear_periodo(db: Session, *, id_usuario: int, id_estado: int, meses: int, inicio: datetime):
    if type(meses) is not int or meses not in (1, 12):
        raise ValueError("El período debe ser mensual o anual.")
    plan = db.scalar(
        select(Plan)
        .where(Plan.IdPlan == PLAN_PRO)
        .with_for_update(read=True)
        .execution_options(populate_existing=True)
    )
    precio = (
        None if plan is None else (plan.PrecioMensualARS if meses == 1 else plan.PrecioAnualARS)
    )
    if plan is None or not plan.Activo or precio is None or precio <= 0:
        raise HTTPException(
            409,
            "El precio de Pro todavía no está configurado.",
            headers={"X-Error-Code": "PLAN_PRICE_UNAVAILABLE"},
        )
    periodo = SuscripcionUsuario(
        IdUsuario=id_usuario,
        IdPlan=PLAN_PRO,
        IdEstadoSuscripcion=id_estado,
        FechaInicio=inicio,
        FechaFin=sumar_meses(inicio, meses),
        PrecioPeriodoARS=precio,
        MesesPeriodo=meses,
    )
    db.add(periodo)
    db.flush()
    return periodo

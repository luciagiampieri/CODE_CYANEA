from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auditoria_plan import AuditoriaPlan
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.schemas.backoffice_plan import ConfiguracionPlanesUpdate

CAMPOS_LIMITES = {
    "maxViajesActivos": "MaxViajesActivos",
    "maxParticipantesViaje": "MaxParticipantesViaje",
    "maxSugerenciasDiarias": "MaxSugerenciasDiarias",
    "maxEscaneosMensuales": "MaxEscaneosMensuales",
    "maxAlmacenamientoMb": "MaxAlmacenamientoMb",
}


def _planes(db: Session, bloquear=False):
    consulta = select(Plan).where(Plan.IdPlan.in_([PLAN_GRATUITO, PLAN_PRO])).order_by(Plan.IdPlan)
    if bloquear:
        consulta = consulta.with_for_update()
    planes = {p.IdPlan: p for p in db.scalars(consulta.execution_options(populate_existing=True))}
    if len(planes) != 2 or any(not p.Activo for p in planes.values()):
        raise HTTPException(
            503,
            "No se pudieron obtener los planes activos.",
            headers={"X-Error-Code": "PLAN_UNAVAILABLE"},
        )
    return planes


def obtener(db: Session):
    planes = _planes(db)
    pro = planes[PLAN_PRO]
    return {
        "precioMensualARS": pro.PrecioMensualARS,
        "precioAnualARS": pro.PrecioAnualARS,
        "gratuito": {k: getattr(planes[PLAN_GRATUITO], v) for k, v in CAMPOS_LIMITES.items()},
        "pro": {k: getattr(pro, v) for k, v in CAMPOS_LIMITES.items()},
    }


def actualizar(db: Session, payload: ConfiguracionPlanesUpdate, id_admin: int, ip: str | None):
    for campo in CAMPOS_LIMITES:
        if getattr(payload.pro, campo) < getattr(payload.gratuito, campo):
            raise HTTPException(
                422,
                "Los límites de Pro deben ser mayores o iguales a los del plan gratuito.",
                headers={"X-Error-Code": "PLAN_LIMIT_INVALID"},
            )
    planes = _planes(db, bloquear=True)
    fecha = datetime.now(timezone.utc)
    cambios = []
    for id_plan, valores in [(PLAN_GRATUITO, payload.gratuito), (PLAN_PRO, payload.pro)]:
        cambios.extend(
            (planes[id_plan], columna, getattr(valores, campo))
            for campo, columna in CAMPOS_LIMITES.items()
        )
    cambios.extend(
        [
            (planes[PLAN_PRO], "PrecioMensualARS", payload.precioMensualARS),
            (planes[PLAN_PRO], "PrecioAnualARS", payload.precioAnualARS),
        ]
    )
    for plan, campo, nuevo in cambios:
        anterior = getattr(plan, campo)
        if anterior == nuevo:
            continue
        db.add(
            AuditoriaPlan(
                IdPlan=plan.IdPlan,
                IdAdministrador=id_admin,
                Campo=campo,
                ValorAnterior=None if anterior is None else str(anterior),
                ValorNuevo=str(nuevo),
                DireccionIp=ip,
                FechaHora=fecha,
            )
        )
        setattr(plan, campo, nuevo)
    db.commit()
    return obtener(db)


def historial(db: Session):
    filas = db.scalars(
        select(AuditoriaPlan).order_by(AuditoriaPlan.IdAuditoriaPlan.desc()).limit(100)
    )
    return [
        {
            "id": f.IdAuditoriaPlan,
            "idPlan": f.IdPlan,
            "idAdministrador": f.IdAdministrador,
            "campo": f.Campo,
            "valorAnterior": f.ValorAnterior,
            "valorNuevo": f.ValorNuevo,
            "fechaHora": f.FechaHora,
        }
        for f in filas
    ]

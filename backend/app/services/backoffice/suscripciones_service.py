from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from math import ceil

from fastapi import HTTPException
from sqlalchemy import DateTime, case, func, or_, select, type_coerce
from sqlalchemy.orm import Session, aliased

from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.plan import Plan
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.services.backoffice.metricas_service import ZONA_AR

TAMANIO_PAGINA = 20


def _usuario_consultable(db, id_usuario):
    usuario = db.get(Usuario, id_usuario)
    if usuario is None or usuario.IdRolSistema == ROL_ADMIN_SISTEMA:
        raise HTTPException(404, "Usuario no encontrado.")
    return usuario


def _usuario(usuario):
    return {
        "id": usuario.IdUsuario,
        "nombreCompleto": f"{usuario.Nombre} {usuario.Apellido}".strip(),
        "nombreUsuario": usuario.NombreUsuario,
        "email": usuario.Email,
    }


def _suscripcion(fila):
    suscripcion, usuario, plan, estado = fila
    return {
        "id": suscripcion.IdSuscripcionUsuario,
        "usuario": _usuario(usuario),
        "plan": plan.Nombre,
        "tipoPlan": {1: "mensual", 12: "anual"}.get(suscripcion.MesesPeriodo),
        "estado": estado.Nombre,
        "fechaInicio": suscripcion.FechaInicio,
        "fechaFin": suscripcion.FechaFin,
        "fechaProximaRenovacion": suscripcion.FechaFin if estado.Nombre == "activa" else None,
        "precioPeriodoARS": suscripcion.PrecioPeriodoARS,
    }


def _consulta_suscripciones():
    return (
        select(SuscripcionUsuario, Usuario, Plan, EstadoSuscripcion)
        .join(Usuario, Usuario.IdUsuario == SuscripcionUsuario.IdUsuario)
        .join(Plan, Plan.IdPlan == SuscripcionUsuario.IdPlan)
        .join(
            EstadoSuscripcion,
            EstadoSuscripcion.IdEstadoSuscripcion == SuscripcionUsuario.IdEstadoSuscripcion,
        )
    )


def _paginacion(total, pagina):
    return {
        "total": total,
        "pagina": pagina,
        "tamanioPagina": TAMANIO_PAGINA,
        "totalPaginas": ceil(total / TAMANIO_PAGINA),
    }


def _buscar_usuario(q):
    patron = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    return or_(
        *[
            campo.ilike(patron, escape="\\")
            for campo in (
                Usuario.Nombre + " " + Usuario.Apellido,
                Usuario.Email,
                Usuario.NombreUsuario,
            )
        ]
    )


def listar(db: Session, *, estado=None, pagina=1, q=None, tipo_plan=None, solo_ultima=False):
    consulta = _consulta_suscripciones()
    if solo_ultima:
        ultimas = select(
            SuscripcionUsuario.IdSuscripcionUsuario.label("id"),
            func.row_number()
            .over(
                partition_by=SuscripcionUsuario.IdUsuario,
                order_by=(
                    SuscripcionUsuario.FechaInicio.desc(),
                    SuscripcionUsuario.IdSuscripcionUsuario.desc(),
                ),
            )
            .label("posicion"),
        ).subquery()
        consulta = consulta.where(
            SuscripcionUsuario.IdSuscripcionUsuario.in_(
                select(ultimas.c.id).where(ultimas.c.posicion == 1)
            )
        )
    if estado:
        consulta = consulta.where(EstadoSuscripcion.Nombre == estado)
    if q and q.strip():
        consulta = consulta.where(_buscar_usuario(q))
    if tipo_plan:
        consulta = consulta.where(
            SuscripcionUsuario.MesesPeriodo == {"mensual": 1, "anual": 12}[tipo_plan]
        )
    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    filas = db.execute(
        consulta.order_by(
            SuscripcionUsuario.FechaInicio.desc(), SuscripcionUsuario.IdSuscripcionUsuario.desc()
        )
        .offset((pagina - 1) * TAMANIO_PAGINA)
        .limit(TAMANIO_PAGINA)
    )
    return {"items": [_suscripcion(f) for f in filas], **_paginacion(total, pagina)}


def obtener(db: Session, id_suscripcion: int):
    fila = db.execute(
        _consulta_suscripciones().where(SuscripcionUsuario.IdSuscripcionUsuario == id_suscripcion)
    ).first()
    if fila is None:
        raise HTTPException(
            404, "La suscripción no existe.", headers={"X-Error-Code": "SUBSCRIPTION_NOT_FOUND"}
        )
    return _suscripcion(fila)


def pagos(
    db: Session,
    *,
    estado=None,
    desde: date | None = None,
    hasta: date | None = None,
    id_suscripcion=None,
    pagina=1,
    q=None,
    id_usuario=None,
):
    if (desde and hasta and hasta < desde) or hasta == date.max:
        raise HTTPException(
            422,
            "El rango de fechas de pagos no es válido.",
            headers={"X-Error-Code": "PAYMENT_DATE_RANGE_INVALID"},
        )
    if id_suscripcion is not None:
        obtener(db, id_suscripcion)
    condiciones = []
    if id_usuario is not None:
        _usuario_consultable(db, id_usuario)
        condiciones.append(SuscripcionUsuario.IdUsuario == id_usuario)
    if estado:
        condiciones.append(EstadoPagoSuscripcion.Nombre == estado)
    if desde:
        condiciones.append(
            PagoSuscripcion.FechaPago
            >= datetime.combine(desde, time.min, tzinfo=ZONA_AR).astimezone(timezone.utc)
        )
    if hasta:
        condiciones.append(
            PagoSuscripcion.FechaPago
            < datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=ZONA_AR).astimezone(
                timezone.utc
            )
        )
    if id_suscripcion is not None:
        condiciones.append(PagoSuscripcion.IdSuscripcionUsuario == id_suscripcion)
    if q and q.strip():
        condiciones.append(_buscar_usuario(q))
    consulta = (
        select(PagoSuscripcion, Usuario, EstadoPagoSuscripcion)
        .join(
            SuscripcionUsuario,
            SuscripcionUsuario.IdSuscripcionUsuario == PagoSuscripcion.IdSuscripcionUsuario,
        )
        .join(Usuario, Usuario.IdUsuario == SuscripcionUsuario.IdUsuario)
        .join(
            EstadoPagoSuscripcion,
            EstadoPagoSuscripcion.IdEstadoPagoSuscripcion
            == PagoSuscripcion.IdEstadoPagoSuscripcion,
        )
        .where(*condiciones)
    )
    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    total_aprobados = db.scalar(
        consulta.where(EstadoPagoSuscripcion.Nombre == "aprobado").with_only_columns(
            func.coalesce(func.sum(PagoSuscripcion.MontoARS), 0), maintain_column_froms=True
        )
    ) or Decimal("0.00")
    filas = db.execute(
        consulta.order_by(
            PagoSuscripcion.FechaPago.desc(), PagoSuscripcion.IdPagoSuscripcion.desc()
        )
        .offset((pagina - 1) * TAMANIO_PAGINA)
        .limit(TAMANIO_PAGINA)
    )
    return {
        "items": [
            {
                "id": pago.IdPagoSuscripcion,
                "idSuscripcion": pago.IdSuscripcionUsuario,
                "usuario": _usuario(usuario),
                "fecha": pago.FechaPago,
                "montoARS": pago.MontoARS,
                "estado": estado_pago.Nombre,
                "idOperacionPasarela": pago.IdOperacionPasarela,
            }
            for pago, usuario, estado_pago in filas
        ],
        **_paginacion(total, pagina),
        "totalIngresosAprobadosARS": total_aprobados,
    }


def historial_usuario(db, id_usuario, *, pagina=1):
    usuario = _usuario_consultable(db, id_usuario)
    orden = (SuscripcionUsuario.FechaInicio, SuscripcionUsuario.IdSuscripcionUsuario)
    ventana = dict(order_by=orden)
    # LAG se calcula sobre TODO el historial antes de paginar, incluidos los periodos
    # anteriores que no aparecen en la pagina actual.
    historia = (
        select(
            SuscripcionUsuario.IdSuscripcionUsuario.label("id"),
            func.lag(SuscripcionUsuario.IdPlan).over(**ventana).label("plan_anterior"),
            func.lag(SuscripcionUsuario.MesesPeriodo).over(**ventana).label("meses_anteriores"),
            type_coerce(
                func.lag(SuscripcionUsuario.FechaFin).over(**ventana), DateTime(timezone=True)
            ).label("fin_anterior"),
        )
        .where(SuscripcionUsuario.IdUsuario == id_usuario)
        .subquery()
    )
    plan_anterior = aliased(Plan)
    consulta = (
        _consulta_suscripciones()
        .join(historia, historia.c.id == SuscripcionUsuario.IdSuscripcionUsuario)
        .outerjoin(plan_anterior, plan_anterior.IdPlan == historia.c.plan_anterior)
        .add_columns(plan_anterior.Nombre, historia.c.meses_anteriores, historia.c.fin_anterior)
    )
    total = db.scalar(select(func.count()).select_from(historia)) or 0
    ultima_fila = db.execute(
        _consulta_suscripciones()
        .where(SuscripcionUsuario.IdUsuario == id_usuario)
        .order_by(
            SuscripcionUsuario.FechaInicio.desc(), SuscripcionUsuario.IdSuscripcionUsuario.desc()
        )
        .limit(1)
    ).first()
    movimientos = []
    for fila in db.execute(
        consulta.order_by(
            SuscripcionUsuario.FechaInicio.desc(), SuscripcionUsuario.IdSuscripcionUsuario.desc()
        )
        .offset((pagina - 1) * TAMANIO_PAGINA)
        .limit(TAMANIO_PAGINA)
    ):
        sub, _, plan, _, anterior, meses, fin = fila
        if fin is not None and fin.tzinfo is None:
            fin = fin.replace(tzinfo=timezone.utc)
        if anterior is None:
            movimiento = "primer_periodo"
        elif anterior != plan.Nombre:
            movimiento = "cambio_plan"
        elif meses is not None and sub.MesesPeriodo is not None and meses != sub.MesesPeriodo:
            movimiento = "cambio_periodicidad"
        elif fin == sub.FechaInicio:
            movimiento = "renovacion"
        else:
            movimiento = "nuevo_periodo"
        movimientos.append(
            {
                **_suscripcion(fila[:4]),
                "movimiento": movimiento,
                "planAnterior": anterior,
                "tipoPlanAnterior": {1: "mensual", 12: "anual"}.get(meses),
                "fechaCancelacion": sub.FechaCancelacion,
            }
        )
    resumen = db.execute(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (EstadoPagoSuscripcion.Nombre == "aprobado", PagoSuscripcion.MontoARS),
                        else_=0,
                    )
                ),
                0,
            ),
            *[
                func.count(case((EstadoPagoSuscripcion.Nombre == estado, 1)))
                for estado in ("aprobado", "pendiente", "rechazado")
            ],
        )
        .select_from(PagoSuscripcion)
        .join(
            EstadoPagoSuscripcion,
            EstadoPagoSuscripcion.IdEstadoPagoSuscripcion
            == PagoSuscripcion.IdEstadoPagoSuscripcion,
        )
        .join(
            SuscripcionUsuario,
            SuscripcionUsuario.IdSuscripcionUsuario == PagoSuscripcion.IdSuscripcionUsuario,
        )
        .where(SuscripcionUsuario.IdUsuario == id_usuario)
    ).one()
    return {
        "planActual": usuario.Plan.Nombre,
        "totalPagadoARS": resumen[0],
        "pagosAprobados": resumen[1],
        "pagosPendientes": resumen[2],
        "pagosRechazados": resumen[3],
        "ultimaSuscripcion": _suscripcion(ultima_fila) if ultima_fila else None,
        "items": movimientos,
        **_paginacion(total, pagina),
    }

"""Monitoreo del consumo de los servicios de IA desde el backoffice (US 114).

Se calcula siempre desde `SolicitudesIA`, que solo tiene metadatos de consumo
(funcionalidad, modelo, resultado, duración, tokens y costo estimado), nunca el
contenido de las solicitudes ni datos de los usuarios (RNF-33).

El umbral de costo es mensual (mes calendario en hora de Argentina): la alerta
visible se muestra al superar el 80% y, al superar el 100%, se envía un correo a
los administradores del sistema una sola vez por mes y por valor de umbral.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.configuracion_monitoreo_ia import (
    ID_CONFIGURACION_MONITOREO_IA,
    ConfiguracionMonitoreoIA,
)
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.solicitud_ia import SolicitudIA
from app.models.usuario import Usuario
from app.schemas.backoffice_monitoreo_ia import (
    ConsumoFuncionalidadIA,
    EstadoUmbralCostoIA,
    MonitoreoIA,
    TotalesConsumoIA,
)
from app.services import registro_ia
from app.services.backoffice.metricas_service import ZONA_AR, hoy_ar, limites_utc
from app.services.mail import get_mail_service

logger = logging.getLogger(__name__)

PORCENTAJE_ADVERTENCIA = Decimal(80)

# Funcionalidades que se muestran siempre (CA 2), en este orden; cualquier otra
# registrada (asistente, entradas) se agrega al final.
FUNCIONALIDADES = {
    registro_ia.SERVICIO_SUGERENCIA_ACTIVIDADES: "Sugerencias de actividades",
    registro_ia.SERVICIO_ESCANEO_COMPROBANTES: "Escaneo de comprobantes",
    registro_ia.SERVICIO_DETECCION_GASTOS_DOCUMENTOS: "Detección de gastos en documentos",
    registro_ia.SERVICIO_GENERACION_PORTADAS: "Generación de portadas",
    registro_ia.SERVICIO_ANALISIS_HORARIOS: "Validación de horarios",
}
OTRAS_FUNCIONALIDADES = {
    registro_ia.SERVICIO_RECOMENDACION_ENTRADAS: "Recomendación de entradas",
    registro_ia.SERVICIO_ASISTENTE_VIAJE: "Asistente del viaje",
}


def _a_float(valor: Decimal | float | int | None) -> float:
    return float(round(Decimal(valor or 0), 6))


def _periodo(fecha: date) -> str:
    return fecha.strftime("%Y-%m")


def _limites_mes_actual() -> tuple[str, datetime, datetime]:
    hoy = hoy_ar()
    inicio, fin = limites_utc(hoy.replace(day=1), hoy)
    return _periodo(hoy), inicio, fin


def obtener_configuracion(db: Session, bloquear: bool = False) -> ConfiguracionMonitoreoIA:
    consulta = select(ConfiguracionMonitoreoIA).where(
        ConfiguracionMonitoreoIA.IdConfiguracionMonitoreoIA == ID_CONFIGURACION_MONITOREO_IA
    )
    if bloquear:
        consulta = consulta.with_for_update()
    configuracion = db.scalar(consulta)
    if configuracion is None:
        configuracion = ConfiguracionMonitoreoIA(IdConfiguracionMonitoreoIA=ID_CONFIGURACION_MONITOREO_IA)
        db.add(configuracion)
        db.flush()
    return configuracion


def costo_del_periodo(db: Session, inicio: datetime, fin: datetime) -> Decimal:
    return Decimal(
        db.scalar(
            select(func.coalesce(func.sum(SolicitudIA.CostoEstimadoUSD), 0)).where(
                SolicitudIA.Fecha >= inicio, SolicitudIA.Fecha < fin
            )
        )
        or 0
    )


def _nivel(costo: Decimal, umbral: Decimal | None) -> tuple[str, float | None]:
    if not umbral:
        return "sin_umbral", None
    porcentaje = costo * 100 / umbral
    if porcentaje > 100:
        nivel = "superado"
    elif porcentaje > PORCENTAJE_ADVERTENCIA:
        nivel = "advertencia"
    else:
        nivel = "normal"
    return nivel, float(round(porcentaje, 1))


def estado_umbral(db: Session) -> EstadoUmbralCostoIA:
    configuracion = obtener_configuracion(db)
    periodo, inicio, fin = _limites_mes_actual()
    costo = costo_del_periodo(db, inicio, fin)
    umbral = configuracion.UmbralCostoMensualUSD
    nivel, porcentaje = _nivel(costo, umbral)
    return EstadoUmbralCostoIA(
        periodo=periodo,
        umbralMensualUSD=float(umbral) if umbral is not None else None,
        costoMesActualUSD=_a_float(costo),
        porcentajeUsado=porcentaje,
        nivel=nivel,
        fechaActualizacion=configuracion.FechaActualizacion,
        fechaUltimaAlerta=configuracion.FechaUltimaAlerta,
    )


def obtener_monitoreo(db: Session, desde: date, hasta: date) -> MonitoreoIA:
    inicio, fin = limites_utc(desde, hasta)
    filas = db.execute(
        select(
            SolicitudIA.Servicio,
            func.count(),
            func.sum(case((SolicitudIA.Exitosa.is_(False), 1), else_=0)),
            func.avg(SolicitudIA.DuracionMs),
            func.coalesce(func.sum(SolicitudIA.CostoEstimadoUSD), 0),
        )
        .where(SolicitudIA.Fecha >= inicio, SolicitudIA.Fecha < fin)
        .group_by(SolicitudIA.Servicio)
    ).all()
    por_servicio = {fila[0]: fila for fila in filas}

    nombres = dict(FUNCIONALIDADES)
    for servicio in por_servicio:
        if servicio not in nombres:
            nombres[servicio] = OTRAS_FUNCIONALIDADES.get(servicio, servicio.replace("_", " ").capitalize())

    funcionalidades = []
    for servicio, nombre in nombres.items():
        _, solicitudes, fallidas, promedio, costo = por_servicio.get(servicio, (servicio, 0, 0, None, 0))
        funcionalidades.append(
            ConsumoFuncionalidadIA(
                servicio=servicio,
                nombre=nombre,
                solicitudes=solicitudes or 0,
                fallidas=int(fallidas or 0),
                tiempoPromedioMs=round(float(promedio)) if promedio is not None else None,
                costoEstimadoUSD=_a_float(costo),
            )
        )

    promedio_total = db.scalar(
        select(func.avg(SolicitudIA.DuracionMs)).where(
            SolicitudIA.Fecha >= inicio, SolicitudIA.Fecha < fin
        )
    )
    totales = TotalesConsumoIA(
        solicitudes=sum(f.solicitudes for f in funcionalidades),
        fallidas=sum(f.fallidas for f in funcionalidades),
        tiempoPromedioMs=round(float(promedio_total)) if promedio_total is not None else None,
        costoEstimadoUSD=_a_float(sum((Decimal(str(f[4] or 0)) for f in filas), Decimal(0))),
    )

    return MonitoreoIA(
        desde=desde,
        hasta=hasta,
        funcionalidades=funcionalidades,
        totales=totales,
        umbral=estado_umbral(db),
    )


def _correos_administradores(db: Session) -> list[str]:
    return list(
        db.scalars(
            select(Usuario.Email).where(
                Usuario.IdRolSistema == ROL_ADMIN_SISTEMA,
                Usuario.Activo.is_(True),
                Usuario.EmailConfirmado.is_(True),
                Usuario.FechaBaja.is_(None),
            )
        ).all()
    )


def _formatear_usd(valor: Decimal) -> str:
    return f"USD {Decimal(valor):,.2f}"


def verificar_umbral_costo(db: Session, mail_service=None) -> bool:
    """Envía el correo a los administradores si el costo del mes superó el umbral.

    Devuelve True si se envió (o se intentó enviar con el correo deshabilitado).
    Se marca el período y el umbral alertados para no repetir el aviso; si el
    envío falla no se marca, así se reintenta con la próxima solicitud."""
    configuracion = obtener_configuracion(db, bloquear=True)
    umbral = configuracion.UmbralCostoMensualUSD
    if not umbral:
        db.commit()
        return False

    periodo, inicio, fin = _limites_mes_actual()
    if configuracion.PeriodoUltimaAlerta == periodo and configuracion.UmbralUltimaAlertaUSD == umbral:
        db.commit()
        return False

    costo = costo_del_periodo(db, inicio, fin)
    if costo <= umbral:
        db.commit()
        return False

    destinatarios = _correos_administradores(db)
    if destinatarios:
        servicio = mail_service or get_mail_service()
        try:
            servicio.send_template(
                to=destinatarios,
                subject="Cyanea: se superó el umbral de costo de IA",
                template_name="ai_cost_threshold.html",
                text_template_name="ai_cost_threshold.txt",
                context={
                    "periodo": datetime.now(ZONA_AR).strftime("%m/%Y"),
                    "costo": _formatear_usd(costo),
                    "umbral": _formatear_usd(umbral),
                    "porcentaje": f"{costo * 100 / umbral:.0f}",
                    "backoffice_url": f"{settings.mail_frontend_base_url.rstrip('/')}/backoffice",
                },
            )
        except Exception:
            logger.exception("No se pudo enviar el correo de umbral de costo de IA superado")
            db.rollback()
            return False
    else:
        logger.warning("Se superó el umbral de costo de IA pero no hay administradores a quienes avisar")

    configuracion.PeriodoUltimaAlerta = periodo
    configuracion.UmbralUltimaAlertaUSD = umbral
    configuracion.FechaUltimaAlerta = datetime.now(timezone.utc)
    db.commit()
    logger.info("Alerta de umbral de costo de IA enviada (%s)", periodo)
    return True


def configurar_umbral(
    db: Session, umbral: Decimal | None, id_usuario: int, mail_service=None
) -> EstadoUmbralCostoIA:
    configuracion = obtener_configuracion(db, bloquear=True)
    configuracion.UmbralCostoMensualUSD = umbral
    configuracion.FechaActualizacion = datetime.now(timezone.utc)
    configuracion.IdUsuarioActualizacion = id_usuario
    db.commit()

    # Si el consumo del mes ya supera el nuevo umbral se avisa en el momento.
    try:
        verificar_umbral_costo(db, mail_service)
    except Exception:
        logger.warning("No se pudo verificar el umbral de costo de IA", exc_info=True)
        db.rollback()
    return estado_umbral(db)

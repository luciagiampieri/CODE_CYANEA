"""US 132: lectura unificada de las auditorias existentes, sin copiar eventos."""
import re
from datetime import date, datetime, time, timedelta, timezone
from math import ceil

from fastapi import HTTPException
from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.orm import Session, aliased

from app.models.auditoria_acceso_backoffice import AuditoriaAccesoBackoffice as Acceso
from app.models.auditoria_plan import AuditoriaPlan
from app.models.auditoria_suspension_usuario import (
    ACCION_REACTIVACION, ACCION_SUSPENSION, AuditoriaSuspensionUsuario as Suspension,
)
from app.models.auditoria_terminos import ACCION_PUBLICACION, AuditoriaTerminos
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.usuario import Usuario
from app.services.backoffice.metricas_service import ZONA_AR

TAMANIO_PAGINA = 20
TIPOS = {
    "inicio_sesion": "Inicio de sesión en backoffice",
    "suspension_usuario": "Suspensión de usuario",
    "reactivacion_usuario": "Reactivación de usuario",
    "publicacion_terminos": "Publicación de Términos y Condiciones",
    "cambio_plan": "Cambio de planes y límites",
}
CAMPOS_PLAN = {
    "PrecioMensualARS": "Precio mensual Pro (ARS)",
    "PrecioAnualARS": "Precio anual Pro (ARS)",
    "MaxViajesActivos": "Viajes activos como administrador",
    "MaxParticipantesViaje": "Participantes por viaje",
    "MaxSugerenciasDiarias": "Solicitudes diarias de sugerencias por viaje",
    "MaxEscaneosMensuales": "Escaneos mensuales por usuario",
    "MaxAlmacenamientoMb": "Almacenamiento por viaje (MB)",
}


def hoy() -> date:
    return datetime.now(ZONA_AR).date()


def _rango(desde, hasta):
    hasta = hasta or hoy()
    try:
        desde = desde or hasta - timedelta(days=6)
        if desde > hasta:
            raise ValueError()
        inicio = datetime.combine(desde, time.min, ZONA_AR).astimezone(timezone.utc)
        fin = datetime.combine(hasta, time.max, ZONA_AR).astimezone(timezone.utc)
    except (ValueError, OverflowError):
        raise HTTPException(422, "El rango de fechas no es válido.", headers={"X-Error-Code": "AUDIT_DATE_RANGE_INVALID"})
    return desde, hasta, inicio, fin


def _eventos():
    # Cada origen conserva su id. Se ordena/pagina el conjunto completo en SQL.
    return union_all(
        select(
            literal("acceso").label("origen"), Acceso.IdAuditoriaAcceso.label("id"),
            Acceso.FechaHora.label("fecha"), literal("inicio_sesion").label("tipo"),
            Acceso.IdUsuario.label("actor"), literal("backoffice").label("entidad_tipo"),
            literal(None).cast(Acceso.IdUsuario.type).label("entidad_id"),
            case((Acceso.Exitoso.is_(True), "exitoso"), else_="fallido").label("resultado"),
        ),
        select(
            literal("suspension"), Suspension.IdAuditoriaSuspension, Suspension.FechaHora,
            case((Suspension.Accion == ACCION_SUSPENSION, "suspension_usuario"), else_="reactivacion_usuario"),
            Suspension.IdAdministrador, literal("usuario"), Suspension.IdUsuario, literal("exitoso"),
        ).where(Suspension.Accion.in_([ACCION_SUSPENSION, ACCION_REACTIVACION])),
        select(
            literal("terminos"), AuditoriaTerminos.IdAuditoriaTerminos, AuditoriaTerminos.FechaHora,
            literal("publicacion_terminos"), AuditoriaTerminos.IdAdministrador,
            literal("terminos"), AuditoriaTerminos.IdVersionTerminos, literal("exitoso"),
        ).where(AuditoriaTerminos.Accion == ACCION_PUBLICACION),
        select(
            literal("plan"), AuditoriaPlan.IdAuditoriaPlan, AuditoriaPlan.FechaHora,
            literal("cambio_plan"), AuditoriaPlan.IdAdministrador,
            literal("plan"), AuditoriaPlan.IdPlan, literal("exitoso"),
        ),
    ).subquery("eventos_auditoria")


def _usuario(usuario):
    if usuario is None:
        return {"id": None, "nombreCompleto": "Usuario no identificado", "email": None, "anonimizado": False}
    anonimizado = usuario.FechaBaja is not None
    return {
        "id": usuario.IdUsuario,
        "nombreCompleto": "Usuario anonimizado" if anonimizado else f"{usuario.Nombre} {usuario.Apellido}".strip(),
        "email": None if anonimizado else usuario.Email,
        "anonimizado": anonimizado,
    }


def opciones(db: Session):
    administradores = db.scalars(select(Usuario).where(Usuario.IdRolSistema == ROL_ADMIN_SISTEMA).order_by(Usuario.IdUsuario)).all()
    return {"tipos": [{"valor": k, "etiqueta": v} for k, v in TIPOS.items()],
            "administradores": [_usuario(u) for u in administradores]}


def _consulta(eventos):
    actor, afectado = aliased(Usuario), aliased(Usuario)
    return select(eventos, actor, afectado).outerjoin(actor, actor.IdUsuario == eventos.c.actor).outerjoin(
        afectado, (eventos.c.entidad_tipo == "usuario") & (afectado.IdUsuario == eventos.c.entidad_id)
    )


def _presentar(fila):
    origen, id_evento, fecha, tipo, _actor, entidad_tipo, entidad_id, resultado, actor, afectado = fila
    nombre = {"backoffice": "Backoffice", "terminos": "Términos y Condiciones",
              "plan": {1: "Plan gratuito", 2: "Plan Pro"}.get(entidad_id, "Plan")}.get(entidad_tipo)
    if entidad_tipo == "usuario":
        nombre = _usuario(afectado)["nombreCompleto"]
    return {
        "id": f"{origen}:{id_evento}", "fechaHora": fecha if fecha.tzinfo else fecha.replace(tzinfo=timezone.utc),
        "tipo": tipo, "usuario": _usuario(actor), "resultado": resultado,
        "entidad": {"tipo": entidad_tipo, "id": entidad_id, "nombre": nombre},
    }


def listar(db: Session, *, desde=None, hasta=None, tipo=None, id_administrador=None, pagina=1):
    desde, hasta, inicio, fin = _rango(desde, hasta)
    eventos = _eventos()
    condiciones = [eventos.c.fecha >= inicio, eventos.c.fecha <= fin]
    if tipo:
        condiciones.append(eventos.c.tipo == tipo)
    if id_administrador is not None:
        condiciones.append(eventos.c.actor == id_administrador)
    total = db.scalar(select(func.count()).select_from(eventos).where(*condiciones)) or 0
    filas = db.execute(_consulta(eventos).where(*condiciones).order_by(
        eventos.c.fecha.desc(), eventos.c.origen.desc(), eventos.c.id.desc()
    ).offset((pagina - 1) * TAMANIO_PAGINA).limit(TAMANIO_PAGINA)).all()
    return {"items": [_presentar(fila) for fila in filas], "total": total, "pagina": pagina,
            "tamanioPagina": TAMANIO_PAGINA, "totalPaginas": ceil(total / TAMANIO_PAGINA),
            "desde": desde, "hasta": hasta}


def _valor_numerico(valor):
    # Solo datos de configuracion numerica, nunca payloads o texto arbitrario.
    return valor if valor is not None and re.fullmatch(r"\d+(?:\.\d+)?", valor) else None


def obtener(db: Session, id_evento: str):
    coincidencia = re.fullmatch(r"(acceso|suspension|terminos|plan):([1-9]\d{0,18})", id_evento)
    if not coincidencia:
        raise HTTPException(404, "Evento de auditoría no encontrado.")
    origen, numero = coincidencia.groups()
    eventos = _eventos()
    fila = db.execute(_consulta(eventos).where(eventos.c.origen == origen, eventos.c.id == int(numero))).first()
    if fila is None:
        raise HTTPException(404, "Evento de auditoría no encontrado.")
    datos = _presentar(fila)
    datos.update(descripcion=TIPOS[datos["tipo"]], cambios=[])
    if origen == "plan":
        registro = db.get(AuditoriaPlan, int(numero))
        if registro.Campo in CAMPOS_PLAN:
            datos["cambios"] = [{"campo": CAMPOS_PLAN[registro.Campo],
                                 "valorAnterior": _valor_numerico(registro.ValorAnterior),
                                 "valorNuevo": _valor_numerico(registro.ValorNuevo)}]
    elif origen == "acceso":
        registro = db.get(Acceso, int(numero))
        datos["descripcion"] = {
            "EXITO": "Inicio de sesión exitoso.",
            "CREDENCIALES_INVALIDAS": "Intento de inicio de sesión rechazado.",
            "BLOQUEO_APLICADO": "Bloqueo temporal por intentos fallidos.",
            "INTENTO_DURANTE_BLOQUEO": "Intento de acceso durante un bloqueo temporal.",
        }.get(registro.Motivo, "Intento de inicio de sesión registrado.")
    return datos

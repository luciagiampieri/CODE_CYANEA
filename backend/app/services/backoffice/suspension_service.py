"""Suspensión y reactivación de cuentas desde el backoffice (US 108).

Reglas:
- solo se suspende una cuenta "Activa" y solo se reactiva una "Suspendida";
- nunca se suspende a un administrador del sistema;
- al suspender se invalidan todos los tokens emitidos hasta ese momento
    (`FechaCierreSesiones`) y no reviven al reactivar;
- los datos del usuario en sus viajes y su plan/suscripción no se tocan;
- cada suspensión y reactivación queda en `AuditoriaSuspensionesUsuarios`;
- el correo es informativo: si falla, la operación igual queda aplicada.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auditoria_suspension_usuario import (
    ACCION_REACTIVACION,
    ACCION_SUSPENSION,
    AuditoriaSuspensionUsuario as Auditoria,
)
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.usuario import Usuario
from app.schemas.backoffice_suspension import (
    LARGO_MAXIMO_MOTIVO,
    EventoSuspension,
    HistorialSuspensiones,
)
from app.services.backoffice.metricas_service import ZONA_AR
from app.services.backoffice.usuarios_service import estado_cuenta
from app.services.mail import get_mail_service

logger = logging.getLogger(__name__)

USER_NOT_FOUND = "USER_NOT_FOUND"
ADMIN_PROTECTED = "ADMIN_PROTECTED"
INVALID_STATE = "INVALID_ACCOUNT_STATE"
REASON_REQUIRED = "SUSPENSION_REASON_REQUIRED"
ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED"

MENSAJE_CUENTA_SUSPENDIDA = (
    "Tu cuenta se encuentra suspendida. Revisá el correo que te enviamos con el motivo "
    "o contactá al soporte de Cyanea."
)

_ETIQUETAS_ESTADO = {
    "pendiente": "Pendiente",
    "activa": "Activa",
    "suspendida": "Suspendida",
    "inactiva": "Inactiva",
}


class SuspensionError(Exception):
    def __init__(self, mensaje: str, status_code: int, codigo: str):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status_code = status_code
        self.codigo = codigo


def cuenta_suspendida(usuario: Usuario) -> bool:
    """True si la cuenta está en estado "Suspendida" (misma definición del backoffice)."""
    return estado_cuenta(usuario) == "suspendida"


def normalizar_motivo(motivo: str | None) -> str:
    limpio = (motivo or "").strip()
    if not limpio:
        raise SuspensionError("Ingresá el motivo de la suspensión.", 422, REASON_REQUIRED)
    if len(limpio) > LARGO_MAXIMO_MOTIVO:
        raise SuspensionError(
            f"El motivo puede tener hasta {LARGO_MAXIMO_MOTIVO} caracteres.", 422, REASON_REQUIRED
        )
    return limpio


def _obtener_usuario(db: Session, id_usuario: int) -> Usuario:
    usuario = db.scalar(
        select(Usuario).where(Usuario.IdUsuario == id_usuario).with_for_update()
    )
    if usuario is None:
        raise SuspensionError("Usuario no encontrado.", 404, USER_NOT_FOUND)
    if usuario.IdRolSistema == ROL_ADMIN_SISTEMA:
        raise SuspensionError(
            "No se puede suspender ni reactivar una cuenta de administrador del sistema.",
            403,
            ADMIN_PROTECTED,
        )
    return usuario


def _fecha_ar(fecha: datetime) -> str:
    return fecha.astimezone(ZONA_AR).strftime("%d/%m/%Y")


def _enviar_correo(mail_service, usuario: Usuario, **kwargs) -> None:
    try:
        servicio = mail_service or get_mail_service()
        servicio.send_template(to=[usuario.Email], **kwargs)
    except Exception:
        logger.warning(
            "No se pudo enviar el correo de suspensión/reactivación",
            exc_info=True,
            extra={"user_id": usuario.IdUsuario},
        )


def suspender(
    db: Session,
    id_usuario: int,
    id_admin: int,
    motivo: str,
    ip: str | None = None,
    mail_service=None,
) -> Usuario:
    usuario = _obtener_usuario(db, id_usuario)
    estado = estado_cuenta(usuario)
    if estado != "activa":
        raise SuspensionError(
            "Solo se puede suspender una cuenta en estado Activa "
            f"(estado actual: {_ETIQUETAS_ESTADO[estado]}).",
            409,
            INVALID_STATE,
        )
    motivo = normalizar_motivo(motivo)

    ahora = datetime.now(timezone.utc)
    usuario.Activo = False
    usuario.MotivoSuspension = motivo
    usuario.FechaSuspension = ahora
    # El iat de los JWT es entero: se trunca al segundo para que un login hecho
    # inmediatamente después de reactivar no quede invalidado.
    usuario.FechaCierreSesiones = ahora.replace(microsecond=0)
    db.add(
        Auditoria(
            IdUsuario=usuario.IdUsuario,
            IdAdministrador=id_admin,
            Accion=ACCION_SUSPENSION,
            Motivo=motivo,
            DireccionIp=ip,
            FechaHora=ahora,
        )
    )
    db.commit()
    db.refresh(usuario)
    logger.info("Cuenta suspendida", extra={"user_id": usuario.IdUsuario, "admin_id": id_admin})

    _enviar_correo(
        mail_service,
        usuario,
        subject="Cyanea: tu cuenta fue suspendida",
        template_name="account_suspended.html",
        text_template_name="account_suspended.txt",
        context={
            "nombre": usuario.Nombre,
            "motivo": motivo,
            "fecha": _fecha_ar(ahora),
        },
    )
    return usuario


def reactivar(
    db: Session,
    id_usuario: int,
    id_admin: int,
    ip: str | None = None,
    mail_service=None,
) -> Usuario:
    usuario = _obtener_usuario(db, id_usuario)
    estado = estado_cuenta(usuario)
    if estado != "suspendida":
        raise SuspensionError(
            "Solo se puede reactivar una cuenta en estado Suspendida "
            f"(estado actual: {_ETIQUETAS_ESTADO[estado]}).",
            409,
            INVALID_STATE,
        )

    ahora = datetime.now(timezone.utc)
    usuario.Activo = True
    usuario.MotivoSuspension = None
    usuario.FechaSuspension = None
    # FechaCierreSesiones se conserva: los tokens anteriores no reviven.
    db.add(
        Auditoria(
            IdUsuario=usuario.IdUsuario,
            IdAdministrador=id_admin,
            Accion=ACCION_REACTIVACION,
            Motivo=None,
            DireccionIp=ip,
            FechaHora=ahora,
        )
    )
    db.commit()
    db.refresh(usuario)
    logger.info("Cuenta reactivada", extra={"user_id": usuario.IdUsuario, "admin_id": id_admin})

    _enviar_correo(
        mail_service,
        usuario,
        subject="Cyanea: tu cuenta fue reactivada",
        template_name="account_reactivated.html",
        text_template_name="account_reactivated.txt",
        context={
            "nombre": usuario.Nombre,
            "fecha": _fecha_ar(ahora),
            "login_url": settings.mail_frontend_base_url.rstrip("/"),
        },
    )
    return usuario


def obtener_historial(db: Session, id_usuario: int) -> HistorialSuspensiones:
    usuario = db.get(Usuario, id_usuario)
    if usuario is None or usuario.IdRolSistema == ROL_ADMIN_SISTEMA:
        raise SuspensionError("Usuario no encontrado.", 404, USER_NOT_FOUND)

    filas = db.execute(
        select(Auditoria, Usuario.Nombre, Usuario.Apellido)
        .join(Usuario, Usuario.IdUsuario == Auditoria.IdAdministrador)
        .where(Auditoria.IdUsuario == id_usuario)
        .order_by(Auditoria.FechaHora.desc(), Auditoria.IdAuditoriaSuspension.desc())
    ).all()

    eventos = [
        EventoSuspension(
            id=auditoria.IdAuditoriaSuspension,
            accion="suspension" if auditoria.Accion == ACCION_SUSPENSION else "reactivacion",
            motivo=auditoria.Motivo,
            fecha=auditoria.FechaHora,
            administrador=f"{nombre} {apellido}".strip(),
        )
        for auditoria, nombre, apellido in filas
    ]

    suspendida = cuenta_suspendida(usuario)
    administrador = None
    if suspendida:
        ultima = next((e for e in eventos if e.accion == "suspension"), None)
        administrador = ultima.administrador if ultima else None

    return HistorialSuspensiones(
        suspendida=suspendida,
        motivoVigente=usuario.MotivoSuspension if suspendida else None,
        fechaSuspension=usuario.FechaSuspension if suspendida else None,
        administrador=administrador,
        historial=eventos,
    )
"""Cambio de contraseña desde "Mi cuenta" (US 101).

A diferencia del restablecimiento por correo, el usuario ya está autenticado y
confirma su identidad con la contraseña actual. Al guardar se cierran las
sesiones de los demás dispositivos (los tokens emitidos antes del cambio dejan
de valer) y el dispositivo actual recibe un token nuevo.
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.usuario import Usuario
from app.services.auth.password_reset_service import validar_reglas_password
from app.services.mail.service import MailService

logger = logging.getLogger(__name__)

PASSWORD_CHANGE_NOT_AVAILABLE = "PASSWORD_CHANGE_NOT_AVAILABLE"
PASSWORD_REQUIRED = "PASSWORD_REQUIRED"
CURRENT_PASSWORD_INVALID = "CURRENT_PASSWORD_INVALID"
PASSWORD_WEAK = "PASSWORD_WEAK"
PASSWORD_SAME_AS_CURRENT = "PASSWORD_SAME_AS_CURRENT"
PASSWORD_MISMATCH = "PASSWORD_MISMATCH"

MENSAJE_EXITO = "Tu contraseña se cambió correctamente. Cerramos tu sesión en los demás dispositivos."


def _error(status_code: int, mensaje: str, codigo: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=mensaje, headers={"X-Error-Code": codigo})


def puede_cambiar_password(usuario: Usuario) -> bool:
    """Solo las cuentas registradas con correo tienen una contraseña propia de Cyanea."""
    return usuario.ProveedorAutenticacion == "local"


def cambiar_password(
    db: Session,
    mail_service: MailService,
    usuario: Usuario,
    password_actual: str,
    password_nueva: str,
    confirmacion: str,
) -> str:
    """Valida y guarda la nueva contraseña. Devuelve el token nuevo del dispositivo actual."""
    if not puede_cambiar_password(usuario):
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "Tu cuenta usa inicio de sesión con Google o Facebook, así que no tiene una "
            "contraseña de Cyanea para cambiar.",
            PASSWORD_CHANGE_NOT_AVAILABLE,
        )

    if not password_actual or not password_nueva or not confirmacion:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "Completá la contraseña actual, la nueva contraseña y su confirmación.",
            PASSWORD_REQUIRED,
        )

    # 400 y no 401: un 401 haría que la app cierre la sesión del usuario.
    if not usuario.HashedPassword or not verify_password(password_actual, usuario.HashedPassword):
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "La contraseña actual es incorrecta.",
            CURRENT_PASSWORD_INVALID,
        )

    faltantes = validar_reglas_password(password_nueva)
    if faltantes:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "La nueva contraseña debe tener: " + ", ".join(faltantes) + ".",
            PASSWORD_WEAK,
        )

    if password_nueva == password_actual:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "La nueva contraseña debe ser distinta de la contraseña actual.",
            PASSWORD_SAME_AS_CURRENT,
        )

    if password_nueva != confirmacion:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "La nueva contraseña y su confirmación no coinciden.",
            PASSWORD_MISMATCH,
        )

    # Sin microsegundos: el `iat` del JWT se guarda en segundos enteros y el token
    # nuevo tiene que quedar vigente aunque se emita en el mismo segundo.
    ahora = datetime.now(timezone.utc).replace(microsecond=0)
    usuario.HashedPassword = hash_password(password_nueva)
    usuario.FechaCambioPassword = ahora
    db.commit()
    logger.info("Contraseña cambiada desde Mi cuenta", extra={"user_id": usuario.IdUsuario})

    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})

    # El correo informa el cambio pero no lo bloquea si el proveedor falla.
    try:
        mail_service.send_template(
            to=[usuario.Email],
            subject="Cambiaste tu contraseña de Cyanea",
            template_name="password_updated.html",
            text_template_name="password_updated.txt",
            context={
                "nombre": usuario.Nombre,
                "fecha": ahora.strftime("%d/%m/%Y %H:%M") + " UTC",
                "recuperar_url": settings.mail_frontend_base_url.rstrip("/"),
            },
        )
    except Exception:
        logger.exception("No se pudo enviar el correo de aviso de cambio de contraseña")

    return token

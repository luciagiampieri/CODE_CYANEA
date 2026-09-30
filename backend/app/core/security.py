# ===== INICIO MODIFICACIÓN (US 59 - Recuperar contraseña): import de logging y JWTError =====
import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.exc import SQLAlchemyError
# ===== FIN MODIFICACIÓN =====

from app.core.config import settings

# ===== INICIO MODIFICACIÓN (US 59): logger =====
logger = logging.getLogger(__name__)
# ===== FIN MODIFICACIÓN =====


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode["exp"] = expire
    # ===== INICIO MODIFICACIÓN (US 59): fecha de emisión para poder invalidar sesiones =====
    to_encode["iat"] = now
    # ===== FIN MODIFICACIÓN =====
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


# ===== INICIO MODIFICACIÓN (US 59): validación de sesión tras restablecer contraseña =====
def _verificar_sesion_vigente(payload: dict) -> None:
    """Rechaza tokens emitidos antes del último restablecimiento de contraseña del usuario."""
    user_id = payload.get("user_id")
    if user_id is None:
        return

    # Imports locales para evitar dependencias circulares
    from sqlalchemy import func, select

    from app.db.session import SessionLocal
    from app.models.recuperacion_password import TokenRecuperacionPassword

    try:
        with SessionLocal() as db:
            ultimo_cambio = db.scalar(
                select(func.max(TokenRecuperacionPassword.FechaUso)).where(
                    TokenRecuperacionPassword.IdUsuario == user_id
                )
            )
    except SQLAlchemyError:
        # Si la tabla todavía no existe o la BD no responde, no bloqueamos el resto del sistema.
        logger.warning("No se pudo verificar el cierre de sesión por cambio de contraseña")
        return

    if ultimo_cambio is None:
        return

    iat = payload.get("iat")
    if iat is None or iat < ultimo_cambio.timestamp():
        raise JWTError("Sesión cerrada por restablecimiento de contraseña.")
# ===== FIN MODIFICACIÓN =====


def decode_access_token(token: str) -> dict:
    # ===== INICIO MODIFICACIÓN (US 59): se valida la sesión después de decodificar =====
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    _verificar_sesion_vigente(payload)
    return payload
    # ===== FIN MODIFICACIÓN =====


def create_email_confirmation_token(email: str) -> str:
    """Token de vida corta (24h) para confirmar el correo del usuario."""
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    return jwt.encode(
        {"sub": email, "exp": expire, "type": "email_confirm"},
        settings.secret_key,
        algorithm=settings.jwt_algorithm, 
    )


def decode_email_confirmation_token(token: str) -> str:
    """
    Decodifica el token de confirmación.
    Retorna el email si es válido.
    Lanza JWTError si expiró o es inválido, ValueError si el tipo no coincide.
    """
    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    if payload.get("type") != "email_confirm":
        raise ValueError("El token no es de confirmación de email.")
    email: str | None = payload.get("sub")
    if not email:
        raise ValueError("Token sin email asociado.")
    return email
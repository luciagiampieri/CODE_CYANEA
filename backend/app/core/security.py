import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings

logger = logging.getLogger(__name__)

TOKEN_ACCESO = "access"
TOKEN_BACKOFFICE = "backoffice"
DURACION_MAXIMA_BACKOFFICE = timedelta(hours=8)


# bcrypt solo admite contraseñas de hasta 72 bytes (en UTF-8 un carácter con acento
# o un emoji ocupa más de uno) y con más falla con una excepción.
MAX_BYTES_PASSWORD = 72
MENSAJE_PASSWORD_DEMASIADO_LARGA = "La contraseña no puede superar los 72 caracteres"


def password_demasiado_larga(plain: str) -> bool:
    return len(plain.encode()) > MAX_BYTES_PASSWORD


def validar_largo_password(plain: str) -> str:
    """Validador para los schemas: rechaza con 422 lo que bcrypt no puede procesar."""
    if password_demasiado_larga(plain):
        raise ValueError(MENSAJE_PASSWORD_DEMASIADO_LARGA)
    return plain


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    # Ninguna contraseña guardada supera el límite: una más larga nunca coincide.
    if password_demasiado_larga(plain):
        return False
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode["exp"] = expire
    to_encode["iat"] = now
    to_encode["type"] = TOKEN_ACCESO
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def _fechas_cierre_sesion(db, user_id: int) -> tuple:
    """Último restablecimiento, último cambio de contraseña y cierre de sesiones del
    usuario, en una sola consulta. Devuelve Nones si el usuario no existe."""
    from sqlalchemy import func, select

    from app.models.recuperacion_password import TokenRecuperacionPassword
    from app.models.usuario import Usuario

    ultimo_restablecimiento = (
        select(func.max(TokenRecuperacionPassword.FechaUso))
        .where(TokenRecuperacionPassword.IdUsuario == user_id)
        .scalar_subquery()
    )
    fila = db.execute(
        select(
            ultimo_restablecimiento,
            Usuario.FechaCambioPassword,
            Usuario.FechaCierreSesiones,
        ).where(Usuario.IdUsuario == user_id)
    ).first()
    return tuple(fila) if fila is not None else (None, None, None)


def _verificar_sesion_vigente(payload: dict, db=None) -> None:
    """Rechaza los tokens emitidos antes de un cambio o restablecimiento de contraseña
    o de un cierre de todas las sesiones (suspensión).

    Si se pasa `db` (la sesión del request) se usa esa, así cada request trabaja con una
    sola sesión; si no, se abre una corta.
    """
    user_id = payload.get("user_id")
    if user_id is None:
        return

    try:
        if db is not None:
            try:
                fechas = _fechas_cierre_sesion(db, user_id)
            except SQLAlchemyError:
                # La sesión del request no puede quedar con la transacción fallida.
                db.rollback()
                raise
        else:
            from app.db import session as session_module

            with session_module.SessionLocal() as sesion_corta:
                fechas = _fechas_cierre_sesion(sesion_corta, user_id)
    except SQLAlchemyError:
        logger.warning("No se pudo verificar el cierre de sesión por cambio de contraseña")
        return

    ultimo_restablecimiento, ultimo_cambio_cuenta, cierre_sesiones = fechas
    cambios = [
        fecha if fecha.tzinfo is not None else fecha.replace(tzinfo=timezone.utc)
        for fecha in (ultimo_restablecimiento, ultimo_cambio_cuenta, cierre_sesiones)
        if fecha is not None
    ]
    if not cambios:
        return

    iat = payload.get("iat")
    if iat is None or iat < max(cambios).timestamp():
        raise JWTError("Sesión cerrada por cambio de contraseña o suspensión de la cuenta.")


def decode_access_token(token: str, db=None) -> dict:
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get("type", TOKEN_ACCESO) != TOKEN_ACCESO:
        raise JWTError("Tipo de token inválido.")
    _verificar_sesion_vigente(payload, db)
    return payload


def create_backoffice_token(user_id: int, id_sesion: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "user_id": user_id,
            "sid": id_sesion,
            "type": TOKEN_BACKOFFICE,
            "iat": now,
            "exp": now + DURACION_MAXIMA_BACKOFFICE,
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_backoffice_token(token: str, db=None) -> dict:
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != TOKEN_BACKOFFICE:
        raise JWTError("El token no es de backoffice.")
    _verificar_sesion_vigente(payload, db)
    return payload


def create_email_confirmation_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    return jwt.encode(
        {"sub": email, "exp": expire, "type": "email_confirm"},
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_email_confirmation_token(token: str) -> str:
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
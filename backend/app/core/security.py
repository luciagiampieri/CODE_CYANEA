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


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode["exp"] = expire
    to_encode["iat"] = now
    to_encode["type"] = TOKEN_ACCESO
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def _verificar_sesion_vigente(payload: dict) -> None:
    user_id = payload.get("user_id")
    if user_id is None:
        return

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
        logger.warning("No se pudo verificar el cierre de sesión por cambio de contraseña")
        return

    if ultimo_cambio is None:
        return

    iat = payload.get("iat")
    if iat is None or iat < ultimo_cambio.timestamp():
        raise JWTError("Sesión cerrada por restablecimiento de contraseña.")


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get("type", TOKEN_ACCESO) != TOKEN_ACCESO:
        raise JWTError("Tipo de token inválido.")
    _verificar_sesion_vigente(payload)
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


def decode_backoffice_token(token: str) -> dict:
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != TOKEN_BACKOFFICE:
        raise JWTError("El token no es de backoffice.")
    _verificar_sesion_vigente(payload)
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
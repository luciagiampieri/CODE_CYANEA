from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from app.core.config import settings


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


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
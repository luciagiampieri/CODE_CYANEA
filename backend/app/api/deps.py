import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

INTERVALO_REGISTRO_ACCESO = timedelta(hours=1)


def _registrar_acceso(db: Session, usuario: Usuario) -> None:
    ahora = datetime.now(timezone.utc)
    ultimo = usuario.UltimoAcceso
    if ultimo is not None and ultimo.tzinfo is None:
        ultimo = ultimo.replace(tzinfo=timezone.utc)
    if ultimo is not None and ahora - ultimo < INTERVALO_REGISTRO_ACCESO:
        return

    usuario.UltimoAcceso = ahora
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.warning("No se pudo registrar el último acceso del usuario", exc_info=True)


def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> Usuario:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id: int | None = payload.get("user_id")
        if user_id is None:
            raise credentials_error
    except JWTError:
        raise credentials_error

    usuario = db.get(Usuario, user_id)
    if usuario is None or not usuario.Activo:
        raise credentials_error

    _registrar_acceso(db, usuario)
    return usuario